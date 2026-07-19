from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uuid
import uvicorn
from pydantic import BaseModel
from typing import List, Optional

from db import init_study_knowledge_db, insert_knowledge, search_knowledge_by_tags, get_chat_session, save_chat_session
from ai_engine import generate_rag_curriculum
from chat_engine import handle_chat_message

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 서버 기동 시 NoSQL형 지식정보창고 테이블 셋업
    print("[INFO] Initializing Knowledge Base...")
    init_study_knowledge_db()
    yield

app = FastAPI(
    title="SelfStudy Knowledge Base API",
    description="RAG 기반 비정형 목표 달성 및 스케줄러 SaaS",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GoalPayload(BaseModel):
    tags: List[str]
    goal_details: dict

@app.post("/knowledge/goal")
async def create_goal_and_schedule(payload: GoalPayload, background_tasks: BackgroundTasks):
    """
    1. 수험생의 새로운 목표를 지식정보창고에 저장
    2. 비동기로 과거 지식 검색(RAG) 후 AI 스케줄 생성하여 저장
    """
    # 1. 원본 목표 지식 저장
    goal_id = f"kb_goal_{uuid.uuid4().hex[:8]}"
    success = insert_knowledge(
        doc_id=goal_id,
        domain_type="GoalSetting",
        tags=payload.tags,
        payload=payload.goal_details
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save goal to Knowledge Base")
        
    # 2. 비동기 RAG 파이프라인 트리거
    background_tasks.add_task(_background_rag_scheduler, goal_id, payload.goal_details, payload.tags)
    
    return {"status": "success", "message": "목표가 지식창고에 저장되었습니다. AI가 과거 지식을 검색하여 최적의 일정을 생성 중입니다.", "goal_id": goal_id}

def _background_rag_scheduler(goal_id: str, goal_details: dict, tags: list):
    """백그라운드에서 실행되는 RAG 기반 일정 생성 로직"""
    print(f"[RAG] Generating curriculum for Goal: {goal_id} with tags: {tags}")
    
    # AI 엔진 호출 (내부적으로 지식정보창고 검색 수행)
    generated_schedule = generate_rag_curriculum(goal_details, tags)
    
    if "error" in generated_schedule:
        print(f"[RAG ERR] {generated_schedule['error']}")
        return
        
    # 학부모 공유용 관찰자 코드(Observer Code) 생성
    import random, string
    observer_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    
    # 생성된 일정을 다시 지식정보창고에 저장
    schedule_id = f"kb_plan_{uuid.uuid4().hex[:8]}"
    
    # 원본 목표 ID 및 관찰자 코드 참조
    generated_schedule["ref_goal_id"] = goal_id 
    generated_schedule["observer_code"] = observer_code
    
    # tags에 'obs_코드'를 넣어 나중에 빠르게 검색 가능하도록 함
    new_tags = tags + ["초기스케줄", f"obs_{observer_code}"]
    
    insert_knowledge(
        doc_id=schedule_id,
        domain_type="StudySchedule",
        tags=new_tags,
        payload=generated_schedule
    )
    print(f"[RAG] Successfully created StudySchedule: {schedule_id} with Observer Code: {observer_code}")

@app.get("/knowledge/search")
async def search_knowledge(tags: str):
    """주어진 태그 리스트(콤마 분리)로 지식정보창고 검색"""
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    results = search_knowledge_by_tags(tag_list, limit=10)
    return {"status": "success", "data": results}

class ChatPayload(BaseModel):
    session_id: str
    message: str

@app.post("/knowledge/chat")
async def process_chat(payload: ChatPayload, background_tasks: BackgroundTasks):
    """대화형 온보딩 마법사 채팅 엔드포인트"""
    session = get_chat_session(payload.session_id)
    
    if not session:
        # 새 세션 생성
        user_id = f"user_{uuid.uuid4().hex[:6]}"
        session = {
            "session_id": payload.session_id,
            "user_id": user_id,
            "current_stage": 1,
            "chat_history": [],
            "collected_data": {},
            "draft_schedule": None,
            "is_finalized": False
        }
    
    current_stage = session["current_stage"]
    if session.get("is_finalized"):
        return {"status": "success", "ai_response": "이미 확정된 일정입니다.", "current_stage": current_stage}

    # AI 상태 머신 호출
    ai_result = handle_chat_message(
        session_id=payload.session_id,
        current_stage=current_stage,
        chat_history=session["chat_history"],
        collected_data=session["collected_data"],
        draft_schedule=session.get("draft_schedule"),
        user_msg=payload.message
    )

    if "error" in ai_result:
        raise HTTPException(status_code=500, detail=ai_result["error"])

    # 채팅 기록 업데이트
    new_history = session["chat_history"] + [
        {"role": "user", "content": payload.message},
        {"role": "assistant", "content": ai_result["ai_response"]}
    ]
    
    new_stage = ai_result["new_stage"]
    new_collected_data = ai_result["new_collected_data"]
    new_draft_schedule = ai_result.get("new_draft_schedule", session.get("draft_schedule"))

    # Mode 1(목표 설정)에서 Mode 2(초안 편집)로 막 넘어간 경우: 즉시 초안(RAG) 생성
    if current_stage == 1 and new_stage == 2:
        tags = ["대화형온보딩", new_collected_data.get("목표", "기본목표")]
        # 동기적으로 초안 생성 (사용자가 바로 봐야 하므로)
        draft = generate_rag_curriculum(new_collected_data, tags)
        new_draft_schedule = draft
        ai_result["ai_response"] += "\n\n🎉 목표가 파악되었습니다! 화면 좌측에 AI가 생성한 '초안 일정'을 띄워드렸어요. 수정하고 싶은 부분이 있다면 저에게 편하게 말씀해 주세요. (예: 주말 일정은 삭제해 줘)"

    # 세션 DB 저장
    save_chat_session(
        session_id=payload.session_id,
        user_id=session["user_id"],
        current_stage=new_stage,
        chat_history=new_history,
        collected_data=new_collected_data,
        draft_schedule=new_draft_schedule,
        is_finalized=False
    )

    return {
        "status": "success",
        "ai_response": ai_result["ai_response"],
        "current_stage": new_stage,
        "collected_data": new_collected_data,
        "draft_schedule": new_draft_schedule
    }

class FinalizePayload(BaseModel):
    session_id: str

@app.post("/knowledge/finalize")
async def finalize_schedule(payload: FinalizePayload):
    """수험생이 수정을 마치고 [이 계획으로 확정하기] 버튼을 누름"""
    session = get_chat_session(payload.session_id)
    if not session or session.get("is_finalized"):
        raise HTTPException(status_code=400, detail="유효하지 않은 세션이거나 이미 확정되었습니다.")
        
    collected_data = session["collected_data"]
    draft_schedule = session["draft_schedule"]
    
    # 1. Goal 저장
    goal_id = f"kb_goal_{uuid.uuid4().hex[:8]}"
    tags = ["대화형온보딩", collected_data.get("목표", "기본목표")]
    insert_knowledge(doc_id=goal_id, domain_type="GoalSetting", tags=tags, payload=collected_data)
    
    # 2. Schedule 저장 및 Observer Code 발급
    import random, string
    observer_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    schedule_id = f"kb_plan_{uuid.uuid4().hex[:8]}"
    
    draft_schedule["ref_goal_id"] = goal_id 
    draft_schedule["observer_code"] = observer_code
    draft_schedule["session_id"] = payload.session_id
    new_tags = tags + ["최종스케줄", f"obs_{observer_code}", f"sess_{payload.session_id}"]
    
    # 만약 Mode 3(리스케줄링) 확정이었다면, 기존 활성 일정을 찾아 superseded 처리함
    search_tag = f"sess_{payload.session_id}"
    old_results = search_knowledge_by_tags([search_tag], limit=5)
    for old_doc in old_results:
        if old_doc["payload"].get("status") != "superseded":
            old_doc["payload"]["status"] = "superseded"
            insert_knowledge(doc_id=old_doc["doc_id"], domain_type=old_doc["domain_type"], tags=old_doc["tags"], payload=old_doc["payload"])
            draft_schedule["ref_previous_schedule_id"] = old_doc["doc_id"]
            break

    insert_knowledge(doc_id=schedule_id, domain_type="StudySchedule", tags=new_tags, payload=draft_schedule)
    
    # 세션 확정 처리 (완료된 후에는 Mode 3를 위해 상태를 유지할 수도 있으나, 일단은 is_finalized=True)
    save_chat_session(session["session_id"], session["user_id"], session["current_stage"], session["chat_history"], collected_data, draft_schedule, True)
    
    return {"status": "success", "message": "성공적으로 확정되었습니다.", "observer_code": observer_code}

class ReschedulePayload(BaseModel):
    session_id: str
    schedule_id: str

@app.post("/knowledge/chat/reschedule")
async def start_reschedule(payload: ReschedulePayload):
    """진도가 밀렸을 때, 기존 일정을 바탕으로 Mode 3 (리스케줄링) 대화 시작"""
    doc = get_knowledge(payload.schedule_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Schedule not found")
        
    session = get_chat_session(payload.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    # 상태를 Mode 3로 변경하고, is_finalized를 False로 풀어 대화 모드로 재진입
    session["current_stage"] = 3
    session["draft_schedule"] = doc["payload"]
    session["is_finalized"] = False
    
    # 대화 기록에 알림용 시스템 메시지 하나 추가 (옵션)
    session["chat_history"].append({
        "role": "assistant",
        "content": "진도가 밀려서 속상하시죠? 괜찮습니다! 현재까지의 달성률을 바탕으로 남은 일정을 어떻게 조정하면 좋을지 말씀해 주세요."
    })
    
    save_chat_session(session["session_id"], session["user_id"], 3, session["chat_history"], session["collected_data"], doc["payload"], False)
    
    return {"status": "success", "message": "리스케줄링 모드로 전환되었습니다."}

@app.get("/knowledge/chat/{session_id}")
async def get_chat(session_id: str):
    """특정 세션의 대화 내역 불러오기"""
    session = get_chat_session(session_id)
    if not session:
        return {"status": "success", "data": None}
    return {"status": "success", "data": session}

@app.get("/knowledge/observe/{observer_code}")
async def get_observed_schedule(observer_code: str):
    """학부모 참관용: 발급된 코드로 읽기 전용 스케줄 불러오기"""
    search_tag = f"obs_{observer_code}"
    results = search_knowledge_by_tags([search_tag], limit=1)
    
    if not results:
        raise HTTPException(status_code=404, detail="유효하지 않은 참관 코드입니다.")
        
    data = results[0]
    data["is_read_only"] = True 
    return {"status": "success", "data": data}

@app.get("/knowledge/student/{session_id}")
async def get_student_schedule(session_id: str):
    """학생 대시보드용: 세션 ID로 최신 스케줄 불러오기"""
    search_tag = f"sess_{session_id}"
    results = search_knowledge_by_tags([search_tag], limit=10)
    
    # 여러 버전이 있을 수 있으므로 최신(제일 먼저 오는) supersed 안된 버전 찾기
    active_schedule = None
    for r in results:
        if r["payload"].get("status") != "superseded":
            active_schedule = r
            break
            
    if not active_schedule:
        return {"status": "success", "data": None}
        
    return {"status": "success", "data": active_schedule}

class TaskTogglePayload(BaseModel):
    week_number: int
    day: str
    task_index: int
    completed: bool

from db import get_knowledge

@app.patch("/knowledge/schedule/{schedule_id}/task")
async def toggle_task_completion(schedule_id: str, payload: TaskTogglePayload):
    """특정 일정의 일일 태스크 완료 상태를 토글"""
    doc = get_knowledge(schedule_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Schedule not found")
        
    sched_payload = doc["payload"]
    
    # 해당 주차 찾기
    for week in sched_payload.get("curriculum", []):
        if week["week_number"] == payload.week_number:
            # 해당 요일 및 인덱스 찾기
            matching_tasks = [t for t in week.get("daily_tasks", []) if t["day"] == payload.day]
            if payload.task_index < len(matching_tasks):
                matching_tasks[payload.task_index]["completed"] = payload.completed
                break
                
    # 변경된 페이로드 다시 저장 (tags 등은 기존 것 유지)
    insert_knowledge(
        doc_id=schedule_id, 
        domain_type=doc["domain_type"], 
        tags=doc["tags"], 
        payload=sched_payload
    )
    
    return {"status": "success", "message": "진도 상태가 업데이트되었습니다."}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
