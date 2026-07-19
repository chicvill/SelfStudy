from datetime import datetime, timedelta
import math

def calculate_schedule(form_data: dict, ai_draft: dict) -> dict:
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
            # If target date is somehow in the past, fallback to 30 days
            if target_date < start_date:
                target_date = start_date + timedelta(days=30)
        except:
            target_date = start_date + timedelta(days=30)
    else:
        # Fallback for old sessions or bad LLM responses
        target_date = start_date + timedelta(days=30)

    
    # 요일 매핑 (0: 월, 6: 일)
    day_map = {"월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5, "일": 6}
    avail_days_str = form_data.get("공부가능요일", [])
    avail_days = [day_map[d] for d in avail_days_str if d in day_map]
    if not avail_days:
        avail_days = [0, 1, 2, 3, 4] # default to weekdays
        
    # 일일 학습 시간 로직 (호환성 및 Dictionary 분기)
    raw_hours = form_data.get("일일학습시간", "2")
    day_mins_map = {} # { 0: 120, 1: 180, ... }
    
    if isinstance(raw_hours, dict):
        for day_str, hours in raw_hours.items():
            if day_str in day_map:
                try:
                    day_mins_map[day_map[day_str]] = int(float(hours) * 60)
                except:
                    day_mins_map[day_map[day_str]] = 120
    else:
        # Fallback for old string format
        try:
            default_hours = float(str(raw_hours).replace("시간", "").strip())
        except:
            default_hours = 2.0
        default_mins = int(default_hours * 60)
        for d in avail_days:
            day_mins_map[d] = default_mins
            
    # Calculate calendar
    calendar = []
    curr_date = start_date
    while curr_date <= target_date:
        wd = curr_date.weekday()
        if wd in avail_days:
            capacity = day_mins_map.get(wd, 120)
            calendar.append({"date": curr_date.strftime("%Y-%m-%d"), "day_str": list(day_map.keys())[wd], "capacity": capacity})
        curr_date += timedelta(days=1)
        
    # Total capacity
    total_capacity = sum([day["capacity"] for day in calendar])
    
    # 2. Calculate unit requirements
    # unit_queue per subject
    subject_queues = {}
    for subj in ai_draft.get("subjects", []):
        subj_name = subj["subject_name"]
        subj_w = subj.get("weight_percent", 0) / 100.0
        subj_total_mins = total_capacity * subj_w
        
        unit_q = []
        for u in subj.get("units", []):
            u_w = u.get("weight_percent", 0) / 100.0
            u_mins = int(subj_total_mins * u_w)
            unit_q.append({
                "unit_name": u["unit_name"],
                "required_mins": u_mins,
                "remaining_mins": u_mins
            })
        subject_queues[subj_name] = unit_q

    # 3. Fill Calendar
    schedule_result = []
    week_num = 1
    
    for idx, day_info in enumerate(calendar):
        if idx > 0 and idx % len(avail_days) == 0:
            week_num += 1
            
        daily_tasks = []
        
        # Allocate time for each subject on this day based on subject weight
        for subj in ai_draft.get("subjects", []):
            subj_name = subj["subject_name"]
            subj_w = subj.get("weight_percent", 0) / 100.0
            alloc_mins = int(day_info["capacity"] * subj_w)
            
            q = subject_queues[subj_name]
            
            while alloc_mins > 0 and q:
                curr_unit = q[0]
                if curr_unit["remaining_mins"] <= alloc_mins:
                    # finish this unit
                    spent = curr_unit["remaining_mins"]
                    alloc_mins -= spent
                    daily_tasks.append({
                        "day": f"Week {week_num} - {day_info['day_str']}",
                        "date": day_info["date"],
                        "subject": subj_name,
                        "unit_name": curr_unit["unit_name"],
                        "task_title": curr_unit["unit_name"],
                        "estimated_minutes": spent,
                        "completed": False
                    })
                    q.pop(0) # remove finished unit
                else:
                    # partial progress
                    curr_unit["remaining_mins"] -= alloc_mins
                    daily_tasks.append({
                        "day": f"Week {week_num} - {day_info['day_str']}",
                        "date": day_info["date"],
                        "subject": subj_name,
                        "unit_name": curr_unit["unit_name"],
                        "task_title": curr_unit["unit_name"],
                        "estimated_minutes": alloc_mins,
                        "completed": False
                    })
                    alloc_mins = 0
                    
        # Group daily tasks into weeks
        # Find or create week in schedule_result
        week_entry = next((w for w in schedule_result if w["week_number"] == week_num), None)
        if not week_entry:
            week_entry = {"week_number": week_num, "week_theme": f"{week_num}주차 학습", "daily_tasks": []}
            schedule_result.append(week_entry)
            
        week_entry["daily_tasks"].extend(daily_tasks)

    return {
        "plan_title": ai_draft.get("plan_title", "맞춤형 진도 계획"),
        "overall_strategy": ai_draft.get("overall_strategy", ""),
        "curriculum": schedule_result,
        "spreadsheet_data": ai_draft # Keep the original % data for UI editing
    }
