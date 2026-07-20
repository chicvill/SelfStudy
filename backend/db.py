import sqlite3
import json
import os

DB_FILE = os.path.join(os.path.dirname(__file__), 'selfstudy.db')

def get_db_conn():
    try:
        conn = sqlite3.connect(DB_FILE, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn
    except Exception as e:
        print(f"DB Connection Error: {e}")
        return None

def init_study_knowledge_db():
    """지식정보창고(Knowledge Base) 기반의 RAG DB 스키마 생성 (SQLite)"""
    conn = get_db_conn()
    if not conn:
        print("[ERR] Failed to connect DB for init_study_knowledge_db")
        return
    try:
        cur = conn.cursor()
        
        # 지식정보창고 핵심 테이블 (JSONB -> TEXT, TEXT[] -> TEXT)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS study_knowledge_bundles (
                id TEXT PRIMARY KEY,
                domain_type TEXT NOT NULL,
                tags TEXT DEFAULT '[]',
                payload TEXT NOT NULL DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 대화형 온보딩 세션 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS study_chat_sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT,
                current_stage INTEGER DEFAULT 1,
                chat_history TEXT DEFAULT '[]',
                collected_data TEXT DEFAULT '{}',
                draft_schedule TEXT DEFAULT NULL,
                is_finalized BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 사용자(Login) 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 유저별 최신 프로필 폼 저장용 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id TEXT PRIMARY KEY,
                form_data TEXT DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 출석체크 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                date TEXT NOT NULL,
                check_in_time TEXT,
                check_out_time TEXT,
                is_managed BOOLEAN DEFAULT 0,
                consult_checked BOOLEAN DEFAULT 0,
                consult_note TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(session_id, date)
            )
        """)
        
        # 관리자 계정 기본 세팅 (admin / 1212)
        cur.execute("INSERT OR IGNORE INTO users (user_id, password) VALUES ('admin', '1212')")
        
        conn.commit()
        print("[OK] SQLite study_knowledge_bundles schema initialized successfully.")
    except Exception as e:
        conn.rollback()
        print(f"[ERR] Study DB Init Error: {e}")
    finally:
        conn.close()

def save_attendance(session_id: str, date: str, check_in_time: str = None, check_out_time: str = None, is_managed: bool = False, consult_checked: bool = False, consult_note: str = ''):
    conn = get_db_conn()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO attendance (session_id, date, check_in_time, check_out_time, is_managed, consult_checked, consult_note)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, date) DO UPDATE SET
                check_in_time = COALESCE(excluded.check_in_time, check_in_time),
                check_out_time = COALESCE(excluded.check_out_time, check_out_time),
                is_managed = excluded.is_managed,
                consult_checked = excluded.consult_checked,
                consult_note = excluded.consult_note
        """, (session_id, date, check_in_time, check_out_time, 1 if is_managed else 0, 1 if consult_checked else 0, consult_note))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"Save Attendance Error: {e}")
        return False
    finally:
        conn.close()

def get_attendance_history(session_id: str):
    conn = get_db_conn()
    if not conn: return []
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM attendance WHERE session_id = ? ORDER BY date DESC", (session_id,))
        rows = cur.fetchall()
        results = []
        for r in rows:
            rd = dict(r)
            rd['is_managed'] = bool(rd['is_managed'])
            rd['consult_checked'] = bool(rd['consult_checked'])
            results.append(rd)
        return results
    except Exception as e:
        print(f"Get Attendance Error: {e}")
        return []
    finally:
        conn.close()

def insert_knowledge(doc_id: str, domain_type: str, tags: list, payload: dict):
    conn = get_db_conn()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO study_knowledge_bundles (id, domain_type, tags, payload)
            VALUES (?, ?, ?, ?)
        """, (doc_id, domain_type, json.dumps(tags, ensure_ascii=False), json.dumps(payload, ensure_ascii=False)))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"Insert Error: {e}")
        return False
    finally:
        conn.close()

def get_knowledge(doc_id: str):
    conn = get_db_conn()
    if not conn: return None
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM study_knowledge_bundles WHERE id = ?", (doc_id,))
        row = cur.fetchone()
        if row:
            row_dict = dict(row)
            if row_dict.get('payload'):
                row_dict['payload'] = json.loads(row_dict['payload'])
            if row_dict.get('tags'):
                row_dict['tags'] = json.loads(row_dict['tags'])
            return row_dict
        return None
    except Exception as e:
        print(f"Get Error: {e}")
        return None
    finally:
        conn.close()

def search_knowledge_by_tags(tags: list, limit: int = 5) -> list:
    """주어진 태그 중 하나라도 일치(Overlap)하는 과거 데이터를 최신순으로 검색 (SQLite)"""
    if not tags: return []
    conn = get_db_conn()
    if not conn: return []
    try:
        cur = conn.cursor()
        # SQLite에서는 JSON 연산자나 LIKE를 이용해 배열 매칭을 우회
        # 여기서는 단순하게 각 태그에 대해 LIKE 검색 수행
        conditions = []
        params = []
        for tag in tags:
            conditions.append("tags LIKE ?")
            params.append(f"%\"{tag}\"%")
            
        where_clause = " OR ".join(conditions)
        
        query = f"""
            SELECT * FROM study_knowledge_bundles
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT ?
        """
        params.append(limit)
        
        cur.execute(query, tuple(params))
        results = []
        for row in cur.fetchall():
            r = dict(row)
            if r.get('payload'): r['payload'] = json.loads(r['payload'])
            if r.get('tags'): r['tags'] = json.loads(r['tags'])
            results.append(r)
        return results
    except Exception as e:
        print(f"Search Error: {e}")
        return []
    finally:
        conn.close()

def get_chat_session(session_id: str):
    conn = get_db_conn()
    if not conn: return None
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM study_chat_sessions WHERE session_id = ?", (session_id,))
        row = cur.fetchone()
        if row:
            row_dict = dict(row)
            for col in ['chat_history', 'collected_data', 'draft_schedule']:
                if row_dict.get(col):
                    row_dict[col] = json.loads(row_dict[col])
            # SQLite stores boolean as 1/0
            row_dict['is_finalized'] = bool(row_dict.get('is_finalized'))
            return row_dict
        return None
    except Exception as e:
        print(f"Get Chat Error: {e}")
        return None
    finally:
        conn.close()

def save_chat_session(session_id: str, user_id: str, current_stage: int, chat_history: list, collected_data: dict, draft_schedule: dict = None, is_finalized: bool = False):
    conn = get_db_conn()
    if not conn: return False
    try:
        cur = conn.cursor()
        ds_json = json.dumps(draft_schedule, ensure_ascii=False) if draft_schedule else None
        
        cur.execute("""
            INSERT INTO study_chat_sessions (session_id, user_id, current_stage, chat_history, collected_data, draft_schedule, is_finalized)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET 
                current_stage = excluded.current_stage,
                chat_history = excluded.chat_history,
                collected_data = excluded.collected_data,
                draft_schedule = excluded.draft_schedule,
                is_finalized = excluded.is_finalized,
                updated_at = CURRENT_TIMESTAMP
        """, (
            session_id, user_id, current_stage, 
            json.dumps(chat_history, ensure_ascii=False), 
            json.dumps(collected_data, ensure_ascii=False), 
            ds_json, 
            1 if is_finalized else 0
        ))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"Save Chat Error: {e}")
        return False
    finally:
        conn.close()

def register_user(user_id: str, password: str) -> bool:
    conn = get_db_conn()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("INSERT INTO users (user_id, password) VALUES (?, ?)", (user_id, password))
        conn.commit()
        return True
    except Exception as e:
        # likely UNIQUE constraint failed
        conn.rollback()
        print(f"Register Error: {e}")
        return False
    finally:
        conn.close()

def verify_user(user_id: str, password: str) -> bool:
    conn = get_db_conn()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("SELECT password FROM users WHERE user_id = ?", (user_id,))
        row = cur.fetchone()
        if row and row['password'] == password:
            return True
        return False
    except Exception as e:
        print(f"Verify Error: {e}")
        return False
    finally:
        conn.close()

def save_user_profile(user_id: str, form_data: dict):
    conn = get_db_conn()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO user_profiles (user_id, form_data)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                form_data = excluded.form_data,
                updated_at = CURRENT_TIMESTAMP
        """, (user_id, json.dumps(form_data, ensure_ascii=False)))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"Save Profile Error: {e}")
        return False
    finally:
        conn.close()

def get_user_profile(user_id: str):
    conn = get_db_conn()
    if not conn: return {}
    try:
        cur = conn.cursor()
        cur.execute("SELECT form_data FROM user_profiles WHERE user_id = ?", (user_id,))
        row = cur.fetchone()
        if row and row['form_data']:
            return json.loads(row['form_data'])
        return {}
    except Exception as e:
        print(f"Get Profile Error: {e}")
        return {}
    finally:
        conn.close()

def get_all_user_profiles():
    conn = get_db_conn()
    if not conn: return []
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM user_profiles")
        rows = cur.fetchall()
        results = []
        for r in rows:
            rd = dict(r)
            if rd.get('form_data'):
                rd['form_data'] = json.loads(rd['form_data'])
            results.append(rd)
        return results
    except Exception as e:
        print(f"Get All Profiles Error: {e}")
        return []
    finally:
        conn.close()
