from datetime import datetime, timedelta
import math

class Scheduler:
    def __init__(self):
        self.day_map = {"월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5, "일": 6}

    def calculate_schedule(self, form_data: dict, ai_draft: dict) -> dict:
        """
        form_data:
        {
          "마감일": "2026-10-05" (or string like "4주 뒤"),
          "공부가능요일": ["월", "수", "금"],
          "일일학습시간": "2", # hours
        }
        
        ai_draft:
        {
          "plan_title": "...",
          "subjects": [
            {"subject_name": "국어", "weight_percent": 50, "units": [{"unit_name": "1단원", "weight_percent": 100}]}
          ]
        }
        """
        
        # 1. Parse Dates and calculate total available days
        start_date = datetime.now()
        target_date_str = ai_draft.get("target_date_iso")
        if target_date_str:
            try:
                target_date = datetime.strptime(target_date_str, "%Y-%m-%d")
                if target_date < start_date:
                    target_date = start_date + timedelta(days=30)
            except:
                target_date = start_date + timedelta(days=30)
        else:
            target_date = start_date + timedelta(days=30)

        avail_days_str = form_data.get("공부가능요일", [])
        avail_days = [self.day_map[d] for d in avail_days_str if d in self.day_map]
        if not avail_days:
            avail_days = [0, 1, 2, 3, 4] # default to weekdays
            
        raw_hours = form_data.get("일일학습시간", "2")
        day_mins_map = {}
        
        if isinstance(raw_hours, dict):
            for day_str, hours in raw_hours.items():
                if day_str in self.day_map:
                    try:
                        day_mins_map[self.day_map[day_str]] = int(float(hours) * 60)
                    except:
                        day_mins_map[self.day_map[day_str]] = 120
        else:
            try:
                default_hours = float(str(raw_hours).replace("시간", "").strip())
            except:
                default_hours = 2.0
            default_mins = int(default_hours * 60)
            for d in avail_days:
                day_mins_map[d] = default_mins
                
        calendar = []
        curr_date = start_date
        while curr_date <= target_date:
            wd = curr_date.weekday()
            if wd in avail_days:
                capacity = day_mins_map.get(wd, 120)
                calendar.append({"date": curr_date.strftime("%Y-%m-%d"), "day_str": list(self.day_map.keys())[wd], "capacity": capacity})
            curr_date += timedelta(days=1)
            
        total_capacity = sum([day["capacity"] for day in calendar])
        
        # 1.5 Calculate global pages and PPM (Pages Per Minute)
        total_pages = 0
        subject_textbooks = {} # subj_name -> dict(textbook_title -> list of units)
        for subj in ai_draft.get("subjects", []):
            if not isinstance(subj, dict): continue
            subj_name = subj.get("subject_name", "미정 과목")
            
            if subj_name not in subject_textbooks:
                subject_textbooks[subj_name] = {}
                
            for u in subj.get("units", []):
                if isinstance(u, dict):
                    start_p = u.get("start_page")
                    end_p = u.get("end_page")
                    tb_title = u.get("textbook_title") or subj.get("textbook_title") or "기본 교재"
                    
                    if tb_title not in subject_textbooks[subj_name]:
                        subject_textbooks[subj_name][tb_title] = []
                        
                    if start_p is not None and end_p is not None:
                        pages = max(1, int(end_p) - int(start_p) + 1)
                        total_pages += pages
                        
                        subject_textbooks[subj_name][tb_title].append({
                            "unit_name": u.get("unit_name", "단원"),
                            "textbook_title": tb_title,
                            "start_page": int(start_p),
                            "end_page": int(end_p),
                            "curr_page": int(start_p),
                            "multiplier": float(u.get("weight_multiplier") or 1.0),
                            "total_pages": pages,
                            "remaining_pages": pages
                        })
                    else:
                        subject_textbooks[subj_name][tb_title].append({
                            "unit_name": str(u.get("unit_name", "단원")),
                            "textbook_title": tb_title,
                            "start_page": None,
                            "end_page": None,
                            "curr_page": None,
                            "multiplier": 1.0,
                            "total_pages": 10,
                            "remaining_pages": 10
                        })
                        total_pages += 10

        pages_per_minute = total_pages / total_capacity if total_capacity > 0 else 0.5
        subject_queues = subject_textbooks 

        # 3. Fill Calendar
        schedule_result = []
        week_num = 1
        is_buffer_sunday_enabled = bool(form_data.get("buffer_sunday", True))
        
        for idx, day_info in enumerate(calendar):
            if idx > 0 and idx % len(avail_days) == 0:
                week_num += 1
                
            daily_tasks = []

            if is_buffer_sunday_enabled and day_info['day_str'] == '일':
                daily_tasks.append({
                    "day": f"Week {week_num} - {day_info['day_str']}",
                    "date": day_info["date"],
                    "subject": "전과목 공통",
                    "unit_name": "주간 미진한 과목 보충 및 자율 복습",
                    "task_title": "🗓️ 보충 학습 및 주간 복습 (Buffer Day)",
                    "estimated_minutes": day_info["capacity"],
                    "completed": False,
                    "is_buffer": True
                })
            else:
                day_capacity_pages = day_info["capacity"] * pages_per_minute
                
                for subj_name, textbooks in subject_queues.items():
                    subj_remaining_pages = sum(u["remaining_pages"] for tb_units in textbooks.values() for u in tb_units)
                    total_remaining_pages = sum(u["remaining_pages"] for all_textbooks in subject_queues.values() for tb_units in all_textbooks.values() for u in tb_units)
                    
                    if total_remaining_pages <= 0:
                        continue
                        
                    subj_w = subj_remaining_pages / total_remaining_pages
                    alloc_pages = day_capacity_pages * subj_w
                    
                    active_textbooks = {tb: units for tb, units in textbooks.items() if sum(u["remaining_pages"] for u in units) > 0}
                    if not active_textbooks:
                        continue
                        
                    for tb_title, tb_units in active_textbooks.items():
                        tb_remaining = sum(u["remaining_pages"] for u in tb_units)
                        tb_alloc_pages = alloc_pages * (tb_remaining / subj_remaining_pages)
                        
                        while tb_alloc_pages > 0.5 and tb_units:
                            curr_unit = tb_units[0]
                            if curr_unit["remaining_pages"] <= 0:
                                tb_units.pop(0)
                                continue
                                
                            spent_pages = min(curr_unit["remaining_pages"], tb_alloc_pages)
                            tb_alloc_pages -= spent_pages
                            curr_unit["remaining_pages"] -= spent_pages
                            
                            slice_start = curr_unit.get("curr_page")
                            if slice_start is not None:
                                slice_end = slice_start + int(spent_pages) - 1
                                if curr_unit["remaining_pages"] <= 0.5:
                                    slice_end = curr_unit["end_page"]
                                    
                                curr_unit["curr_page"] = slice_end + 1
                                page_range_str = f"p.{int(slice_start)}~p.{int(slice_end)}"
                            else:
                                page_range_str = ""
                                
                            tb_prefix = f"[{curr_unit['textbook_title']}] " if curr_unit.get("textbook_title") else ""
                            slice_mins = int(spent_pages / pages_per_minute) if pages_per_minute > 0 else 30
                            
                            daily_tasks.append({
                                "day": f"Week {week_num} - {day_info['day_str']}",
                                "date": day_info["date"],
                                "subject": subj_name,
                                "unit_name": curr_unit["unit_name"],
                                "task_title": f"{tb_prefix}{curr_unit['unit_name']} {page_range_str}".strip(),
                                "page_range": page_range_str,
                                "estimated_minutes": slice_mins,
                                "completed": False
                            })
                            
                            if curr_unit["remaining_pages"] <= 0.5:
                                tb_units.pop(0)
                                
            if daily_tasks:
                week_entry = next((w for w in schedule_result if w["week_number"] == week_num), None)
                if not week_entry:
                    week_entry = {"week_number": week_num, "week_theme": f"{week_num}주차 학습", "daily_tasks": []}
                    schedule_result.append(week_entry)
                
                if isinstance(week_entry.get("daily_tasks"), list):
                    week_entry["daily_tasks"].extend(daily_tasks)

        return {
            "plan_title": ai_draft.get("plan_title", "맞춤형 진도 계획"),
            "overall_strategy": ai_draft.get("overall_strategy", ""),
            "curriculum": schedule_result,
            "spreadsheet_data": ai_draft
        }

    def reschedule_auto(self, form_data: dict, active_schedule_payload: dict) -> dict:
        """
        진도가 밀렸을 때, 완료된 일정을 보존하고 미완료 일정만 오늘부터 마감일까지 알고리즘 기반 재조정
        (페이지 기반 분배 알고리즘 적용)
        """
        import copy
        import re
        
        # 1. 완료된 태스크 분리
        completed_tasks = []
        for week in active_schedule_payload.get("curriculum", []):
            if isinstance(week, dict):
                for task in week.get("daily_tasks", []):
                    if isinstance(task, dict):
                        task_with_week = {**task}
                        if "week_number" not in task_with_week:
                            task_with_week["week_number"] = week.get("week_number", 1)
                        if task.get("completed"):
                            completed_tasks.append(task_with_week)
                            
        # 2. 마지막 완료된 페이지 파악
        last_completed_pages = {} # (subj, tb_title, unit_name) -> max_end_page
        for task in completed_tasks:
            subj = task.get("subject")
            unit = task.get("unit_name")
            title = task.get("task_title", "")
            pr = task.get("page_range", "")
            
            tb_title = ""
            m_tb = re.match(r"^\[(.*?)\]", title)
            if m_tb:
                tb_title = m_tb.group(1).strip()
                
            if pr:
                m_pr = re.search(r"~p\.(\d+)", pr)
                if m_pr:
                    end_p = int(m_pr.group(1))
                    key = (subj, tb_title, unit)
                    if key not in last_completed_pages or end_p > last_completed_pages[key]:
                        last_completed_pages[key] = end_p
                        
        # 3. spreadsheet_data 복사 및 start_page 업데이트
        new_spreadsheet = copy.deepcopy(active_schedule_payload.get("spreadsheet_data", {}))
        
        for subj in new_spreadsheet.get("subjects", []):
            if not isinstance(subj, dict): continue
            s_name = subj.get("subject_name", "미정 과목")
            
            active_units = []
            for u in subj.get("units", []):
                if isinstance(u, dict):
                    tb_title = (u.get("textbook_title") or subj.get("textbook_title") or "기본 교재").strip()
                    u_name = u.get("unit_name", "단원")
                    
                    key = (s_name, tb_title, u_name)
                    if key in last_completed_pages:
                        new_start = last_completed_pages[key] + 1
                        orig_end = u.get("end_page")
                        if orig_end is not None:
                            if new_start > int(orig_end):
                                # 완전 완료된 단원 스킵
                                continue
                            else:
                                u["start_page"] = new_start
                                u["curr_page"] = new_start
                active_units.append(u)
            subj["units"] = active_units
            
        # 4. calculate_schedule 호출하여 새 달력 기반 배분
        new_draft = self.calculate_schedule(form_data, new_spreadsheet)
        
        # 5. 기존 완료된 태스크 병합
        final_curriculum = []
        max_completed_week = 0
        if completed_tasks:
            max_completed_week = max([int(t.get("week_number", 0)) for t in completed_tasks])
            for week_n in sorted(list(set([t["week_number"] for t in completed_tasks]))):
                week_tasks = [t for t in completed_tasks if t["week_number"] == week_n]
                final_curriculum.append({
                    "week_number": week_n,
                    "week_theme": f"{week_n}주차 학습 (완료)",
                    "daily_tasks": week_tasks
                })
                
        for w in new_draft.get("curriculum", []):
            w["week_number"] += max_completed_week
            w["week_theme"] = f"{w['week_number']}주차 학습"
            for t in w.get("daily_tasks", []):
                t["day"] = re.sub(r"Week \d+", f"Week {w['week_number']}", t.get("day", ""))
            final_curriculum.append(w)
            
        target_date_str = active_schedule_payload.get("target_date_iso") or form_data.get("마감일")
        if not target_date_str:
            target_date_str = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
            
        new_payload = {
            "plan_title": active_schedule_payload.get("plan_title", "재조정된 진도 계획"),
            "overall_strategy": active_schedule_payload.get("overall_strategy", ""),
            "target_date_iso": target_date_str,
            "observer_code": active_schedule_payload.get("observer_code"),
            "session_id": active_schedule_payload.get("session_id"),
            "ref_goal_id": active_schedule_payload.get("ref_goal_id"),
            "ref_previous_schedule_id": active_schedule_payload.get("doc_id"),
            "curriculum": final_curriculum,
            "spreadsheet_data": new_spreadsheet
        }
        
        return new_payload
