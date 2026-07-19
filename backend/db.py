import os
import psycopg2
from psycopg2 import pool as pg_pool
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv(), override=True)
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://mqcafe_user:mqcafe_pass@localhost:5432/mqcafe_db")

_pool = None

def get_pool():
    global _pool
    if _pool is None or _pool.closed:
        _pool = pg_pool.ThreadedConnectionPool(1, 5, dsn=DATABASE_URL)
    return _pool

def get_db_conn():
    try:
        pool = get_pool()
        raw = pool.getconn()
        raw.autocommit = False
        raw.set_client_encoding('UTF8')
        return raw
    except Exception as e:
        print(f"DB Connection Error: {e}")
        return None

def put_db_conn(conn):
    try:
        if conn and not conn.closed:
            conn.rollback()
            get_pool().putconn(conn)
    except Exception:
        pass

def init_study_knowledge_db():
    """지식정보창고(Knowledge Base) 기반의 RAG DB 스키마 생성"""
    conn = get_db_conn()
    if not conn:
        print("[ERR] Failed to connect DB for init_study_knowledge_db")
        return
    try:
        cur = conn.cursor()
        
        # 지식정보창고 핵심 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS study_knowledge_bundles (
                id TEXT PRIMARY KEY,           -- 고유 ID (uuid 등)
                domain_type TEXT NOT NULL,     -- 'GoalSetting', 'StudySchedule', 'ProgressReport', 'AIFeedback'
                tags TEXT[] DEFAULT '{}',      -- 검색을 위한 메타데이터 태그 배열 (PostgreSQL Array)
                payload JSONB NOT NULL DEFAULT '{}', -- 실제 자유형태의 데이터
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        
        # 대화형 온보딩 세션 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS study_chat_sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT,
                current_stage INTEGER DEFAULT 1,
                chat_history JSONB DEFAULT '[]',
                collected_data JSONB DEFAULT '{}',
                draft_schedule JSONB DEFAULT NULL,
                is_finalized BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """)
        
        # 태그 검색 성능을 위한 GIN 인덱스 (선택적이지만 권장)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_study_knowledge_tags ON study_knowledge_bundles USING GIN (tags);
        """)
        
        conn.commit()
        print("[OK] study_knowledge_bundles schema initialized successfully.")
    except Exception as e:
        conn.rollback()
        print(f"[ERR] Study DB Init Error: {e}")
    finally:
        cur.close()
        put_db_conn(conn)

def insert_knowledge(doc_id: str, domain_type: str, tags: list, payload: dict):
    """지식정보를 창고에 저장"""
    import json
    conn = get_db_conn()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO study_knowledge_bundles (id, domain_type, tags, payload)
            VALUES (%s, %s, %s, %s::jsonb)
        """, (doc_id, domain_type, tags, json.dumps(payload, ensure_ascii=False)))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"Insert Error: {e}")
        return False
    finally:
        cur.close()
        put_db_conn(conn)

def get_knowledge(doc_id: str):
    conn = get_db_conn()
    if not conn: return None
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM study_knowledge_bundles WHERE doc_id = %s", (doc_id,))
        row = cur.fetchone()
        if row and isinstance(row.get('payload'), str):
            import json
            row['payload'] = json.loads(row['payload'])
        return row
    except Exception as e:
        print(f"Get Error: {e}")
        return None
    finally:
        cur.close()
        put_db_conn(conn)

def search_knowledge_by_tags(tags: list, limit: int = 5) -> list:
    """주어진 태그 중 하나라도 일치(Overlap)하는 과거 데이터를 최신순으로 검색"""
    if not tags: return []
    conn = get_db_conn()
    if not conn: return []
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        # && 연산자: 배열 간 교집합이 있는지 확인
        cur.execute("""
            SELECT * FROM study_knowledge_bundles
            WHERE tags && %s::text[]
            ORDER BY created_at DESC
            LIMIT %s
        """, (tags, limit))
        return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        print(f"Search Error: {e}")
        return []
    finally:
        cur.close()
        put_db_conn(conn)

def get_chat_session(session_id: str):
    conn = get_db_conn()
    if not conn: return None
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM study_chat_sessions WHERE session_id = %s", (session_id,))
        row = cur.fetchone()
        if row:
            return dict(row)
        return None
    except Exception as e:
        print(f"Get Chat Error: {e}")
        return None
    finally:
        cur.close()
        put_db_conn(conn)

def save_chat_session(session_id: str, user_id: str, current_stage: int, chat_history: list, collected_data: dict, draft_schedule: dict = None, is_finalized: bool = False):
    import json
    conn = get_db_conn()
    if not conn: return False
    try:
        cur = conn.cursor()
        
        ds_json = json.dumps(draft_schedule, ensure_ascii=False) if draft_schedule else None
        
        cur.execute("""
            INSERT INTO study_chat_sessions (session_id, user_id, current_stage, chat_history, collected_data, draft_schedule, is_finalized)
            VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s)
            ON CONFLICT (session_id) 
            DO UPDATE SET 
                current_stage = EXCLUDED.current_stage,
                chat_history = EXCLUDED.chat_history,
                collected_data = EXCLUDED.collected_data,
                draft_schedule = EXCLUDED.draft_schedule,
                is_finalized = EXCLUDED.is_finalized,
                updated_at = NOW()
        """, (session_id, user_id, current_stage, json.dumps(chat_history, ensure_ascii=False), json.dumps(collected_data, ensure_ascii=False), ds_json, is_finalized))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"Save Chat Error: {e}")
        return False
    finally:
        cur.close()
        put_db_conn(conn)
