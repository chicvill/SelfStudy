import sqlite3
import json
import os
from contextlib import contextmanager

class DatabaseManager:
    def __init__(self, db_file: str = None):
        if db_file is None:
            db_file = os.path.join(os.path.dirname(__file__), 'selfstudy.db')
        self.db_file = db_file
        self.init_study_knowledge_db()

    def get_db_conn(self):
        try:
            conn = sqlite3.connect(self.db_file, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            return conn
        except Exception as e:
            print(f"DB Connection Error: {e}")
            return None

    @contextmanager
    def connection(self):
        conn = self.get_db_conn()
        if conn is None:
            raise RuntimeError("Database connection could not be established")
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

    def init_study_knowledge_db(self):
        """지식정보창고(Knowledge Base) 기반의 RAG DB 스키마 생성 (SQLite)"""
        conn = self.get_db_conn()
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
                    name TEXT DEFAULT '',
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
                    scheduled_in_time TEXT,
                    scheduled_out_time TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(session_id, date)
                )
            """)
            
            # 3자 실시간 메시지 테이블
            cur.execute("""
                CREATE TABLE IF NOT EXISTS study_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    sender_role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 스키마 마이그레이션 (컬럼 동적 추가)
            for col, col_type in [
                ("scheduled_in_time", "TEXT"),
                ("scheduled_out_time", "TEXT"),
                ("consult_start_time", "TEXT"),
                ("tag_count", "INTEGER DEFAULT 0"),
                ("tag1_time", "TEXT"),
                ("tag2_time", "TEXT"),
                ("tag3_time", "TEXT")
            ]:
                try:
                    cur.execute(f"ALTER TABLE attendance ADD COLUMN {col} {col_type}")
                except sqlite3.OperationalError:
                    pass
            
            # users 테이블 name 컬럼 추가 마이그레이션
            try:
                cur.execute("ALTER TABLE users ADD COLUMN name TEXT DEFAULT ''")
            except sqlite3.OperationalError:
                pass
            
            # 관리자 계정 기본 세팅 (010-1111-2222 / 1212)
            cur.execute("INSERT OR IGNORE INTO users (user_id, password, name) VALUES ('010-1111-2222', '1212', '관리자')")
            cur.execute("UPDATE users SET name = '관리자' WHERE user_id = '010-1111-2222' AND (name IS NULL OR name = '')")
            
            conn.commit()
            print("[OK] SQLite study_knowledge_bundles schema initialized successfully.")
        except Exception as e:
            conn.rollback()
            print(f"[ERR] Study DB Init Error: {e}")
        finally:
            conn.close()


class UserRepository:
    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager

    def register_user(self, user_id: str, password: str, name: str = '') -> bool:
        try:
            with self.db_manager.connection() as conn:
                cur = conn.cursor()
                cur.execute("INSERT INTO users (user_id, password, name) VALUES (?, ?, ?)", (user_id, password, name))
                return True
        except Exception as e:
            print(f"Register Error: {e}")
            return False

    def verify_user(self, user_id: str, password: str) -> bool:
        try:
            with self.db_manager.connection() as conn:
                cur = conn.cursor()
                cur.execute("SELECT password FROM users WHERE user_id = ?", (user_id,))
                row = cur.fetchone()
                if row and row['password'] == password:
                    return True
                return False
        except Exception as e:
            print(f"Verify Error: {e}")
            return False

    def get_user_info(self, user_id: str) -> dict:
        try:
            with self.db_manager.connection() as conn:
                cur = conn.cursor()
                cur.execute("SELECT user_id, password, name FROM users WHERE user_id = ?", (user_id,))
                row = cur.fetchone()
                if row:
                    return dict(row)
                return None
        except Exception as e:
            print(f"Get User Info Error: {e}")
            return None

    def update_user_info(self, user_id: str, name: str, password: str) -> bool:
        try:
            with self.db_manager.connection() as conn:
                cur = conn.cursor()
                cur.execute("""
                    UPDATE users 
                    SET name = ?, password = ? 
                    WHERE user_id = ?
                """, (name, password, user_id))
                return True
        except Exception as e:
            print(f"Update User Info Error: {e}")
            return False

    def save_user_profile(self, user_id: str, form_data: dict) -> bool:
        try:
            with self.db_manager.connection() as conn:
                cur = conn.cursor()
                cur.execute("""
                    INSERT INTO user_profiles (user_id, form_data)
                    VALUES (?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                        form_data = excluded.form_data,
                        updated_at = CURRENT_TIMESTAMP
                """, (user_id, json.dumps(form_data, ensure_ascii=False)))
                return True
        except Exception as e:
            print(f"Save Profile Error: {e}")
            return False

    def get_user_profile(self, user_id: str) -> dict:
        try:
            with self.db_manager.connection() as conn:
                cur = conn.cursor()
                cur.execute("SELECT form_data FROM user_profiles WHERE user_id = ?", (user_id,))
                row = cur.fetchone()
                if row and row['form_data']:
                    return json.loads(row['form_data'])
                return {}
        except Exception as e:
            print(f"Get Profile Error: {e}")
            return {}

    def get_all_user_profiles(self) -> list:
        try:
            with self.db_manager.connection() as conn:
                cur = conn.cursor()
                cur.execute("""
                    SELECT up.user_id, up.form_data, up.updated_at, u.name 
                    FROM user_profiles up
                    LEFT JOIN users u ON up.user_id = u.user_id
                """)
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


class KnowledgeRepository:
    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager

    def insert_knowledge(self, doc_id: str, domain_type: str, tags: list, payload: dict) -> bool:
        try:
            with self.db_manager.connection() as conn:
                cur = conn.cursor()
                cur.execute("""
                    INSERT INTO study_knowledge_bundles (id, domain_type, tags, payload)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        domain_type = excluded.domain_type,
                        tags = excluded.tags,
                        payload = excluded.payload,
                        created_at = CURRENT_TIMESTAMP
                """, (doc_id, domain_type, json.dumps(tags, ensure_ascii=False), json.dumps(payload, ensure_ascii=False)))
                return True
        except Exception as e:
            print(f"Insert Error: {e}")
            return False

    def get_knowledge(self, doc_id: str) -> dict | None:
        try:
            with self.db_manager.connection() as conn:
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

    def search_knowledge_by_tags(self, tags: list, limit: int = 5) -> list:
        if not tags: return []
        try:
            with self.db_manager.connection() as conn:
                cur = conn.cursor()
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


class ChatSessionRepository:
    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager

    def get_chat_session(self, session_id: str) -> dict | None:
        try:
            with self.db_manager.connection() as conn:
                cur = conn.cursor()
                cur.execute("SELECT * FROM study_chat_sessions WHERE session_id = ?", (session_id,))
                row = cur.fetchone()
                if row:
                    row_dict = dict(row)
                    for col in ['chat_history', 'collected_data', 'draft_schedule']:
                        if row_dict.get(col):
                            row_dict[col] = json.loads(row_dict[col])
                    row_dict['is_finalized'] = bool(row_dict.get('is_finalized'))
                    return row_dict
                return None
        except Exception as e:
            print(f"Get Chat Error: {e}")
            return None

    def save_chat_session(self, session_id: str, user_id: str, current_stage: int, chat_history: list, collected_data: dict, draft_schedule: dict | None = None, is_finalized: bool = False) -> bool:
        try:
            with self.db_manager.connection() as conn:
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
                return True
        except Exception as e:
            print(f"Save Chat Error: {e}")
            return False


class AttendanceRepository:
    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager

    def save_attendance(
        self,
        session_id: str, 
        date: str, 
        check_in_time: str | None = None, 
        check_out_time: str | None = None, 
        is_managed: bool = False, 
        consult_checked: bool = False, 
        consult_note: str = '', 
        scheduled_in_time: str | None = None, 
        scheduled_out_time: str | None = None,
        consult_start_time: str | None = None,
        tag_count: int | None = None,
        tag1_time: str | None = None,
        tag2_time: str | None = None,
        tag3_time: str | None = None
    ) -> bool:
        try:
            with self.db_manager.connection() as conn:
                cur = conn.cursor()
                cur.execute("""
                    INSERT INTO attendance (
                        session_id, date, check_in_time, check_out_time, is_managed, consult_checked, 
                        consult_note, scheduled_in_time, scheduled_out_time, consult_start_time, 
                        tag_count, tag1_time, tag2_time, tag3_time
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(session_id, date) DO UPDATE SET
                        check_in_time = COALESCE(excluded.check_in_time, check_in_time),
                        check_out_time = COALESCE(excluded.check_out_time, check_out_time),
                        is_managed = excluded.is_managed,
                        consult_checked = excluded.consult_checked,
                        consult_note = excluded.consult_note,
                        scheduled_in_time = COALESCE(excluded.scheduled_in_time, scheduled_in_time),
                        scheduled_out_time = COALESCE(excluded.scheduled_out_time, scheduled_out_time),
                        consult_start_time = COALESCE(excluded.consult_start_time, consult_start_time),
                        tag_count = COALESCE(excluded.tag_count, tag_count),
                        tag1_time = COALESCE(excluded.tag1_time, tag1_time),
                        tag2_time = COALESCE(excluded.tag2_time, tag2_time),
                        tag3_time = COALESCE(excluded.tag3_time, tag3_time)
                """, (
                    session_id, date, check_in_time, check_out_time, 1 if is_managed else 0, 1 if consult_checked else 0, 
                    consult_note, scheduled_in_time, scheduled_out_time, consult_start_time, 
                    tag_count, tag1_time, tag2_time, tag3_time
                ))
                return True
        except Exception as e:
            print(f"Save Attendance Error: {e}")
            return False

    def get_attendance_history(self, session_id: str) -> list:
        try:
            with self.db_manager.connection() as conn:
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


class MessageRepository:
    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager

    def save_study_message(self, session_id: str, sender_role: str, content: str) -> bool:
        try:
            with self.db_manager.connection() as conn:
                cur = conn.cursor()
                cur.execute("""
                    INSERT INTO study_messages (session_id, sender_role, content)
                    VALUES (?, ?, ?)
                """, (session_id, sender_role, content))
                return True
        except Exception as e:
            print(f"Save Message Error: {e}")
            return False

    def get_study_messages(self, session_id: str) -> list:
        try:
            with self.db_manager.connection() as conn:
                cur = conn.cursor()
                cur.execute("SELECT * FROM study_messages WHERE session_id = ? ORDER BY created_at ASC", (session_id,))
                rows = cur.fetchall()
                results = []
                for r in rows:
                    results.append(dict(r))
                return results
        except Exception as e:
            print(f"Get Messages Error: {e}")
            return []
