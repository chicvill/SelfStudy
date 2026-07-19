import os
import json
from dotenv import load_dotenv, find_dotenv
from google import genai
from google.genai import types
from db import search_knowledge_by_tags

load_dotenv(find_dotenv(), override=True)

gemini_key = os.getenv("GEMINI_API_KEY")
gemini_client = None

if gemini_key and not gemini_key.startswith("MY_"):
    try:
        gemini_client = genai.Client(api_key=gemini_key)
        print("[OK] Gemini AI Engine configured for SelfStudy RAG.")
    except Exception as e:
        print(f"[WARN] Failed to configure Gemini: {e}")

def generate_rag_curriculum(user_goal: dict, tags: list) -> dict:
    """
    RAG 아키텍처: 주어진 태그로 과거 지식(유사한 목표, 일정, 실패/성공 사례)을 검색하고,
    이를 프롬프트의 맥락(Context)으로 제공하여 완전히 새로운 맞춤형 일정을 생성.
    """
    if not gemini_client:
        return {"error": "AI 엔진 미설정. (GEMINI_API_KEY 확인)"}

    # 1. 지식정보창고 검색 (Retrieval)
    past_knowledges = search_knowledge_by_tags(tags, limit=3)
    
    context_text = ""
    if past_knowledges:
        context_text = "다음은 이전에 비슷한 목표를 가졌던 수험생들의 실제 경험 데이터(성공/실패 등)입니다. 이 지식을 참고하여 새로운 수험생의 일정을 만들어주세요:\n"
        for kb in past_knowledges:
            context_text += f"[{kb['domain_type']}] 태그: {kb['tags']} \n내용: {json.dumps(kb['payload'], ensure_ascii=False)}\n\n"
    else:
        context_text = "이전에 비슷한 목표를 가진 수험생 데이터가 없습니다. 일반적인 최상의 전략을 바탕으로 생성해주세요.\n"

    # 2. 프롬프트 생성 (Augmentation)
    prompt = f"""
당신은 모든 자격증과 개인 목표 달성을 도와주는 만능 AI 튜터입니다.
아래의 [과거 지식 데이터]를 분석하여 성공 요인은 취하고 실패 요인은 회피하는 전략을 세우세요.
그리고 [새로운 수험생 정보]를 바탕으로 2주 분량의 상세한 '진도 계획(Progress Plan)' JSON을 작성해주세요.

[과거 지식 데이터 (Context)]
{context_text}

[새로운 수험생 정보]
목표: {json.dumps(user_goal, ensure_ascii=False)}

[요구사항]
- 결과는 단일 JSON 객체여야 합니다.
- 다음과 같은 구조를 가져야 합니다:
  {{
    "plan_title": "...",
    "duration_weeks": 2,
    "overall_strategy": "과거 데이터 분석을 반영한 학습 전략",
    "curriculum": [
      {{
        "week_number": 1,
        "week_theme": "...",
        "daily_tasks": [
          {{"day": "Day 1", "subject": "과목명", "task_title": "상세 내용", "estimated_minutes": 120}}
        ]
      }}
    ]
  }}
- 출력은 백틱(```json) 없이 원시 JSON 문자열로만 반환하십시오.
"""
    # 3. AI 답변 생성 (Generation)
    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.7
            ),
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"[AI ERROR] {e}")
        return {"error": "생성 중 오류가 발생했습니다."}
