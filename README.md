# MQstudy: 자기주도학습 플랫폼 (SelfStudy Platform)

MQstudy는 AI 기술을 활용하여 학생들의 자기주도학습 계획을 설계하고, 학습 진도를 체계적으로 관리 및 평가할 수 있도록 지원하는 메타인지 기반 학습 플랫폼입니다.

---

## 🌟 주요 기능

### 1. 개인화된 온보딩 & AI 진도표 설계
* **목표 설정 (`GoalOnboardingForm`)**: 학습 목표, 공부 가능 요일, 일일 학습 시간 등의 기본 정보를 입력받습니다.
* **스케줄러 빌더 마법사 (`ScheduleBuilderWizard`)**:
  * 입력된 목표 데이터를 기반으로 AI가 필요한 과목 리스트를 추천합니다.
  * 과목별/단원별 가중치(공부 비율 %)를 조절할 수 있습니다.
  * AI가 일일 가용 시간과 가중치를 계산하여 일자별 맞춤형 진도 계획을 자동으로 계산해 줍니다.

### 2. 학생 대시보드 & 일일 체크리스트 (`StudentDashboard`)
* **일일 계획표**: 요일별/과목별로 배정된 진도와 배정 시간(분)을 테이블 형식으로 확인합니다.
* **학습 완료 처리**: 완료된 단원은 체크 및 선 긋기 처리되며, 학습 성취율이 갱신됩니다.
* **진도 재조정 (AI 리스케줄링)**: 학습이 밀렸을 때, 현재까지의 진도를 바탕으로 남은 기간의 일정을 지능적으로 재배분합니다.

### 3. 메타인지 학습 평가 챗봇
* **🎙️ 평가받기**: 단원을 마친 후 마이크 입력(STT) 혹은 텍스트 입력을 통해 핵심 개념을 스스로 설명해 봅니다.
* **AI 실시간 피드백**: 설명한 내용을 AI가 분석하여 평가 점수(성취율 %)와 피드백을 실시간으로 제공합니다.

### 4. 학부모 참관 대시보드 (`ParentDashboard`)
* **참관 코드 조회**: 학생 대시보드에서 고유 참관 코드가 발급됩니다.
* **실시간 모니터링**: 학부모는 참관 코드를 입력하여 자녀의 일일 학습 진도와 성취율, 피드백을 실시간으로 읽기 전용 모드로 조회할 수 있습니다.

### 5. 지식창고 탐색 (`KnowledgeBrowser`)
* 플랫폼에 축적된 다양한 커리큘럼 지식 데이터베이스(Goal, Schedule 등)를 탐색할 수 있습니다.

---

## 🛠️ 기술 스택

* **Frontend**: React, Vite, Axios, CSS (Vanilla Custom)
* **Backend**: FastAPI, Uvicorn, SQLite3, Pydantic v2
* **AI / LLM**: Gemini API (`gemini-2.5-flash` 모델 활용)

---

## 🚀 시작하기 (실행 방법)

### 사전 요구 사항
1. **Python 3.10+** 설치
2. **Node.js 18+** 설치
3. 프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 Gemini API 키를 입력합니다:
   ```env
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   ```

### 윈도우 원클릭 자동 실행
프로젝트 루트 폴더에 있는 `RUN.BAT` 파일을 더블클릭하면 백엔드 서버(FastAPI)와 프론트엔드 서버(Vite React)가 각각 독립된 명령 프롬프트 창으로 동시에 실행됩니다.

* **백엔드 주소**: `http://localhost:8001`
* **프론트엔드 주소**: `http://localhost:5220` (또는 터미널에 표시된 포트)

---

## 📂 프로젝트 구조

```text
├── backend/
│   ├── main.py            # FastAPI 메인 라우터 및 API 엔드포인트
│   ├── ai_engine.py       # Gemini API 연동 및 RAG 프롬프트 엔지니어링
│   ├── scheduler.py       # 달력 기반 진도 비율 및 일일 시간 분배 알고리즘
│   ├── db.py              # SQLite3 스키마 정의 및 CRUD 함수
│   ├── selfstudy.db       # 로컬 SQLite 데이터베이스 파일 (자동 생성)
│   └── requirements.txt   # 백엔드 의존성 목록
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # 애플리케이션 루트 및 라우팅 제어
│   │   ├── Login.tsx                  # 사용자 세션 진입 화면
│   │   ├── GoalOnboardingForm.tsx     # 1단계 목표 및 일정 입력 폼
│   │   ├── ScheduleBuilderWizard.tsx  # 15단계 개편에 맞춘 AI 스케줄러 빌더
│   │   ├── StudentDashboard.tsx       # 학생 진도 체크리스트 및 AI 평가 대화창
│   │   ├── ParentDashboard.tsx        # 학부모 전용 읽기 전용 대시보드
│   │   └── KnowledgeBrowser.tsx       # 지식창고 탐색 뷰어
│   └── package.json       # 프론트엔드 의존성 목록
│
├── RUN.BAT                # 프론트엔드 & 백엔드 동시 실행 배치 파일
└── README.md              # 프로젝트 설명 문서
```
