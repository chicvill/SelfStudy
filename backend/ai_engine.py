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
그리고 [새로운 수험생 정보]를 바탕으로 정밀한 알고리즘 스케줄링을 위한 '과목 및 단원별 배분율' JSON을 작성해주세요.

[과거 지식 데이터 (Context)]
{context_text}

[새로운 수험생 정보]
목표: {json.dumps(user_goal, ensure_ascii=False)}

[요구사항]
- 수험생의 목표를 이루기 위해 필요한 과목들을 도출하고, 과목별 중요도에 따라 학습 시간 배분율(%)의 총합이 100%가 되도록 설정하세요.
- 각 과목 하위에 구체적인 단원(목차) 리스트를 생성하세요. 단, 교재의 단순한 '단원명'이나 '페이지 수'로 분할하지 말고, '성취해야 할 핵심 목표나 행동(Action)' 단위로 `unit_name`을 작성하세요. (예: '2단원. 방정식' 대신 '이차방정식의 근의 공식을 이해하고 3문제 설명하기')
- `overall_strategy` 항목에는 학생들이 선택할 수 있는 '다양한 학습 매체(영상 시청, 교재 읽기, 백지 복습 등) 추천 선택지'를 반드시 포함하여 자기주도학습을 가이드하세요.
- 해당 과목 내에서 단원별 배분율(%)의 총합이 100%가 되도록 설정하세요.
- 결과는 단일 JSON 객체여야 합니다.
- 다음과 같은 구조를 가져야 합니다:
  {{
    "plan_title": "목표 달성 진도 계획",
    "overall_strategy": "과거 데이터 분석을 반영한 학습 전략 및 추천 학습법 선택지 제시",
    "target_date_iso": "YYYY-MM-DD",
    "subjects": [
      {{
        "subject_name": "국어",
        "weight_percent": 40,
        "units": [
          {{"unit_name": "시의 화자가 느끼는 감정 3가지 찾아내어 설명하기", "weight_percent": 30}},
          {{"unit_name": "소설의 시점을 파악하고 주인공의 심리 변화 요약하기", "weight_percent": 70}}
        ]
      }},
      {{
        "subject_name": "수학",
        "weight_percent": 60,
        "units": [
          {{"unit_name": "일차방정식의 개념을 이해하고 동생에게 설명하듯 말해보기", "weight_percent": 50}},
          {{"unit_name": "함수의 그래프를 직접 그리고 특징 3가지 찾아내기", "weight_percent": 50}}
        ]
      }}
    ]
  }}
- target_date_iso는 사용자가 입력한 마감일(예: 2026.11.10, 다음달 말)을 무조건 정확한 날짜 포맷(YYYY-MM-DD)으로 파싱해야 합니다.
- 출력은 백틱(```json) 없이 원시 JSON 문자열로만 반환하십시오.
"""
    # 3. AI 답변 생성 (Generation)
    return _call_gemini(prompt)

def _build_context(tags: list):
    past_knowledges = search_knowledge_by_tags(tags, limit=3)
    if past_knowledges:
        context_text = "다음은 이전에 비슷한 목표를 가졌던 수험생들의 실제 경험 데이터입니다. 참고하여 새로운 수험생을 도와주세요:\n"
        for kb in past_knowledges:
            context_text += f"[{kb['domain_type']}] 태그: {kb['tags']} \n내용: {json.dumps(kb['payload'], ensure_ascii=False)}\n\n"
        return context_text
    return "이전에 비슷한 목표를 가진 수험생 데이터가 없습니다. 일반적인 최상의 전략을 바탕으로 생성해주세요.\n"

def _call_gemini(prompt: str):
    if not gemini_client:
        return {"error": "AI 엔진 미설정"}
    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.7)
        )
        text = response.text.strip()
        import re
        
        # 정규표현식을 사용하여 JSON 블록 추출 시도
        json_match = re.search(r'```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```', text, re.DOTALL)
        if json_match:
            text = json_match.group(1)
        else:
            # 백틱이 없지만 양 끝에 { 나 [ 가 있는 경우
            text = text.strip()
            if not ((text.startswith('{') and text.endswith('}')) or (text.startswith('[') and text.endswith(']'))):
                # JSON 형태가 전혀 아니면 예외를 발생시키기 위해 강제로 빈 괄호를 주거나 그냥 loads하게 둠
                pass
                
        return json.loads(text.strip())
    except Exception as outer_e:
        import traceback
        print(f"[AI ERROR] Exception in _call_gemini: {outer_e}")
        traceback.print_exc()
        try:
            print(f"[AI ERROR] RAW RESPONSE TEXT: {response.text}")
        except Exception as inner_e:
            print(f"[AI ERROR] {inner_e}")
        return {"error": f"생성 중 오류 발생: {str(outer_e)}"}

def generate_subjects(user_goal: dict, tags: list) -> dict:
    context_text = _build_context(tags)
    prompt = f"""
당신은 만능 AI 튜터입니다. [과거 지식 데이터]를 분석하여 [새로운 수험생 정보]를 바탕으로 학습해야 할 '과목 리스트'를 생성해주세요.
[과거 지식 데이터]
{context_text}

목표: {json.dumps(user_goal, ensure_ascii=False)}

[요구사항]
- 수험생의 목표를 이루기 위해 필요한 과목명들을 도출하세요.
- 전반적인 학습 전략(overall_strategy)과 예상 마감일(target_date_iso)도 함께 산출하세요.
- 출력 형식:
  {{
    "plan_title": "목표 달성 진도 계획",
    "overall_strategy": "추천 학습법 및 전략",
    "target_date_iso": "YYYY-MM-DD",
    "subjects": [
      {{"subject_name": "국어"}},
      {{"subject_name": "수학"}}
    ]
  }}
- 출력은 백틱(```json) 없이 원시 JSON 문자열로만 반환하십시오.
"""
    return _call_gemini(prompt)

def generate_subject_weights(subjects: list, user_goal: dict) -> dict:
    prompt = f"""
당신은 만능 AI 튜터입니다.
다음은 수험생이 확정한 과목 리스트입니다: {json.dumps(subjects, ensure_ascii=False)}
목표: {json.dumps(user_goal, ensure_ascii=False)}

[요구사항]
- 각 과목의 난이도와 중요도를 평가하여, 학습 시간 비중(%)을 산출하세요.
- 총합은 반드시 100%가 되어야 합니다.
- 출력 형식:
  {{
    "subjects": [
      {{"subject_name": "국어", "weight_percent": 40}},
      {{"subject_name": "수학", "weight_percent": 60}}
    ]
  }}
- 출력은 백틱(```json) 없이 원시 JSON 문자열로만 반환하십시오.
"""
    return _call_gemini(prompt)

def generate_units(subjects: list, user_goal: dict) -> dict:
    prompt = f"""
당신은 만능 AI 튜터입니다.
수험생의 목표: {json.dumps(user_goal, ensure_ascii=False)}
확정된 과목 리스트(비중 포함): {json.dumps(subjects, ensure_ascii=False)}

[요구사항]
- 각 과목 하위에 구체적인 단원(목차) 리스트를 생성하세요.
- '성취해야 할 핵심 목표나 행동(Action)' 단위로 `unit_name`을 작성하세요.
- 비중(weight_percent)은 아직 계산하지 마세요.
- 출력 형식:
  {{
    "subjects": [
      {{
        "subject_name": "국어",
        "weight_percent": 40,
        "units": [
          {{"unit_name": "시의 화자가 느끼는 감정 3가지 찾아내기"}},
          {{"unit_name": "소설의 시점을 파악하기"}}
        ]
      }}
    ]
  }}
"""
    return _call_gemini(prompt)

def generate_unit_weights(subjects_with_units: list, user_goal: dict) -> dict:
    prompt = f"""
당신은 만능 AI 튜터입니다.
수험생 목표: {json.dumps(user_goal, ensure_ascii=False)}
단원이 포함된 과목 리스트: {json.dumps(subjects_with_units, ensure_ascii=False)}

[요구사항]
- 각 과목(subject) 내에서, 단원(units)들의 중요도와 학습 분량을 평가하여 단원별 비중(weight_percent)을 산출하세요.
- '하나의 과목' 내에서 모든 단원 비중의 합은 100%가 되어야 합니다.
- 출력 형식:
  {{
    "subjects": [
      {{
        "subject_name": "국어",
        "weight_percent": 40,
        "units": [
          {{"unit_name": "시의 화자가 느끼는 감정 3가지 찾아내기", "weight_percent": 40}},
          {{"unit_name": "소설의 시점을 파악하기", "weight_percent": 60}}
        ]
      }}
    ]
  }}
"""
    return _call_gemini(prompt)

