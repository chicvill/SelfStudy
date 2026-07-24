import { useState, useEffect } from 'react';
import ScheduleBuilderWizard from './ScheduleBuilderWizard';
import KnowledgeBrowser from './KnowledgeBrowser';
import ParentDashboard from './ParentDashboard';
import StudentDashboard from './StudentDashboard';
import GoalOnboardingForm from './GoalOnboardingForm';
import Login from './Login';
import AdminDashboard from './AdminDashboard';
import ProfileEdit from './ProfileEdit';
import axios from 'axios';

import { API_URL } from './config';

const generateSessionId = () => "sess_" + Math.random().toString(36).substr(2, 9);

function App() {
  const [loggedInUserId, setLoggedInUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [currentTab, setCurrentTab] = useState<'onboarding' | 'browser' | 'parent' | 'student' | 'admin' | 'profile_edit'>('onboarding');
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [wizardFormData, setWizardFormData] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let sid = localStorage.getItem("selfstudy_session_id");
    if (!sid) {
      sid = generateSessionId();
      localStorage.setItem("selfstudy_session_id", sid);
    }
    setSessionId(sid);
  }, []);

  const handleLogin = async (id: string) => {
    setLoggedInUserId(id);
    setSessionId(id); // 사용자의 전화번호를 세션 ID로 사용
    localStorage.setItem("selfstudy_session_id", id);

    // 로그인 시 사용자 이름 조회
    try {
      const uRes = await axios.get(`${API_URL}/knowledge/user/${id}`);
      if (uRes.data.status === 'success' && uRes.data.data) {
        setUserName(uRes.data.data.name || '');
      }
    } catch (err) {
      console.error("Failed to fetch user name", err);
    }
    
    if (id === '010-1111-2222') {
      setIsOnboarded(true);
      setCurrentTab('admin');
      return;
    }
    
    // 로그인 시 기존 스케줄이 있는지 확인하여 있으면 대시보드로 이동
    try {
      const res = await axios.get(`${API_URL}/knowledge/student/${id}`);
      if (res.data.data) {
        setIsOnboarded(true);
        setCurrentTab('student');
        setActiveScheduleId(res.data.data.doc_id);
        return;
      }
    } catch (e) {
      console.error("Failed to fetch schedule on login", e);
    }

    // 파이널라이즈된 스케줄이 없으면 초안(진행중인 세션)이 있는지 확인
    try {
      const chatRes = await axios.get(`${API_URL}/knowledge/chat/${id}`);
      if (chatRes.data.data) {
        const session = chatRes.data.data;
        if (session.current_stage >= 2 && session.draft_schedule) {
          setWizardFormData(session.collected_data || {});
          setIsOnboarded(true);
          setCurrentTab('onboarding'); // AIChatWizard 화면으로 이동
          return;
        }
      }
    } catch (e) {
      console.error("Failed to fetch chat session on login", e);
    }

    // 아무것도 없으면 기본 폼으로 진입
    setIsOnboarded(false);
    setCurrentTab('onboarding');
  };

  const handleReschedule = () => {
    setIsOnboarded(false); // 리스케줄링 시 온보딩을 다시 처음부터? (기존 로직: 챗봇 진입)
    // 15단계 개편에서는 초기 Form부터 다시 하거나, 
    // 혹은 백엔드에서 기존 폼 데이터를 다시 가져와서 ScheduleBuilderWizard에 넘겨야 함
    // 현재는 단순히 초기화하여 다시 시작하도록 설정
    setCurrentTab('onboarding');
    setIsSidebarOpen(false);
  };

  const handleLogout = () => {
    setLoggedInUserId(null);
    setUserName('');
    setIsOnboarded(false);
    setActiveScheduleId(null);
    setIsSidebarOpen(false);
    localStorage.removeItem('selfstudy_saved_user_id');
    localStorage.removeItem('selfstudy_saved_user_name');
  };

  const handleMenuClick = (tab: any, isOnboardedVal: boolean) => {
    setCurrentTab(tab);
    setIsOnboarded(isOnboardedVal);
    setIsSidebarOpen(false);
  };

  if (!sessionId) return <div>Loading...</div>;

  if (!loggedInUserId) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div style={{ 
      fontFamily: "'Pretendard', sans-serif", 
      height: '100vh', 
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(135deg, #0b1a6c 0%, #35158a 50%, #6830c2 100%)'
    }}>
      <header style={{ padding: '12px 15px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '28px', cursor: 'pointer', padding: 0, lineHeight: 1 }}
          >
            ☰
          </button>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ margin: 0, color: '#fff', fontSize: 'clamp(16px, 4vw, 22px)', fontWeight: '800', lineHeight: 1.2 }}>
              MQstudy <span style={{ color: '#82d7ff' }}>자기주도학습</span>
            </h1>
            {userName && (
              <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#e0e0e0', marginTop: '2px' }}>
                ({userName} {loggedInUserId === '010-1111-2222' ? '관리자' : '수험생'}님)
              </span>
            )}
          </div>
        </div>
        <div style={{ fontSize: '12px', fontWeight: '600', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', borderRadius: '12px', whiteSpace: 'nowrap' }}>
          {currentTime.getFullYear()}-
          {String(currentTime.getMonth() + 1).padStart(2, '0')}-
          {String(currentTime.getDate()).padStart(2, '0')} {' '}
          {String(currentTime.getHours()).padStart(2, '0')}:
          {String(currentTime.getMinutes()).padStart(2, '0')}:
          {String(currentTime.getSeconds()).padStart(2, '0')}
        </div>
      </header>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }}
        />
      )}

      {/* Sidebar Drawer */}
      <div style={{
        position: 'fixed', top: 0, left: isSidebarOpen ? 0 : '-300px', width: '280px', height: '100vh',
        background: '#fff', zIndex: 1000, transition: 'left 0.3s ease', boxShadow: '5px 0 15px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', padding: '20px', boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
          <button onClick={() => setIsSidebarOpen(false)} style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#555' }}>✕</button>
        </div>
        
        <h3 style={{ margin: '0 0 20px 0', color: '#1976d2' }}>메뉴</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
          {loggedInUserId === '010-1111-2222' ? (
            <button onClick={() => handleMenuClick('admin', true)} style={sidebarButtonStyle(currentTab === 'admin')}>🏫 관리 대시보드</button>
          ) : (
            <>
              <button onClick={() => handleMenuClick('student', true)} style={sidebarButtonStyle(currentTab === 'student')}>📈 나의 대시보드</button>
              <button onClick={() => handleMenuClick('onboarding', false)} style={sidebarButtonStyle(currentTab === 'onboarding' && !isOnboarded)}>📝 목표 및 개인정보 설정</button>
              
              <div style={{ padding: '10px 0', borderTop: '1px solid #eee', borderBottom: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button 
                  onClick={() => activeScheduleId ? handleReschedule() : alert('확정된 일정이 없습니다.')} 
                  style={sidebarButtonStyle(false)}
                >
                  ⚖️ 과목별 학습량 비율(가중치) 설정
                </button>
                <button 
                  onClick={() => activeScheduleId ? handleReschedule() : alert('확정된 일정이 없습니다.')} 
                  style={sidebarButtonStyle(false)}
                >
                  ⚖️ 단원별 학습량 비율(가중치) 설정
                </button>
              </div>
            </>
          )}
          
          <button onClick={() => handleMenuClick('profile_edit', true)} style={sidebarButtonStyle(currentTab === 'profile_edit')}>👤 개인 정보 수정</button>
          <button onClick={() => handleMenuClick('browser', true)} style={sidebarButtonStyle(currentTab === 'browser')}>📖 지식창고 탐색</button>
          <button onClick={() => handleMenuClick('parent', true)} style={sidebarButtonStyle(currentTab === 'parent')}>👥 학부모 참관</button>
        </div>

        {/* 로그아웃 버튼 */}
        <div style={{ marginTop: 'auto', paddingTop: '15px', borderTop: '1px solid #eee' }}>
          <button 
            onClick={handleLogout} 
            style={{
              width: '100%',
              background: '#fff0f0',
              color: '#d32f2f',
              border: '1px solid #ffcdd2',
              padding: '12px 15px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              textAlign: 'left',
              fontSize: '15px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            🚪 로그아웃
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '0 20px 20px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {currentTab === 'onboarding' && (
          !isOnboarded ? (
            <GoalOnboardingForm 
              sessionId={sessionId} 
              userId={loggedInUserId}
              onComplete={(formData) => {
                setWizardFormData(formData);
                setIsOnboarded(true);
              }} 
            />
          ) : (
            <ScheduleBuilderWizard 
              sessionId={sessionId} 
              userId={loggedInUserId!}
              initialFormData={wizardFormData}
              onFinalized={() => {
                setCurrentTab('student');
                // 확정 시 활성 스케줄 갱신 필요
                axios.get(`${API_URL}/knowledge/student/${loggedInUserId}`).then(res => {
                  if(res.data.data) setActiveScheduleId(res.data.data.doc_id);
                });
              }} 
            />
          )
        )}
        {currentTab === 'student' && <StudentDashboard sessionId={sessionId} onReschedule={handleReschedule} />}
        {currentTab === 'browser' && <KnowledgeBrowser />}
        {currentTab === 'parent' && <ParentDashboard />}
        {currentTab === 'admin' && <AdminDashboard onLogout={handleLogout} />}
        {currentTab === 'profile_edit' && (
          <ProfileEdit 
            userId={loggedInUserId!} 
            onSaved={(newName) => {
              setUserName(newName);
              setCurrentTab(loggedInUserId === '010-1111-2222' ? 'admin' : 'student');
            }} 
          />
        )}
      </main>
    </div>
  );
}

const sidebarButtonStyle = (isActive: boolean) => ({
  background: isActive ? '#e3f2fd' : 'transparent',
  color: isActive ? '#1976d2' : '#555',
  border: 'none',
  padding: '12px 15px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 'bold',
  textAlign: 'left' as const,
  fontSize: '15px',
  transition: 'background 0.2s'
});

export default App;
