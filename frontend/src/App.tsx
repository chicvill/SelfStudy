import { useState, useEffect } from 'react';
import AIChatWizard from './AIChatWizard';
import KnowledgeBrowser from './KnowledgeBrowser';
import ParentDashboard from './ParentDashboard';
import StudentDashboard from './StudentDashboard';
import GoalOnboardingForm from './GoalOnboardingForm';
import Login from './Login';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

const generateSessionId = () => "sess_" + Math.random().toString(36).substr(2, 9);

function App() {
  const [loggedInUserId, setLoggedInUserId] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<'onboarding' | 'browser' | 'parent' | 'student'>('onboarding');
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);

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
    
    // 로그인 시 기존 스케줄이 있는지 확인하여 있으면 대시보드로 이동
    try {
      const res = await axios.get(`${API_URL}/knowledge/student/${id}`);
      if (res.data.data) {
        setIsOnboarded(true);
        setCurrentTab('student');
      }
    } catch (e) {
      console.error("Failed to fetch schedule on login", e);
    }
  };

  const handleReschedule = (scheduleId: string) => {
    setRescheduleId(scheduleId);
    setIsOnboarded(true); // 리스케줄링은 폼 없이 바로 챗봇 진입
    setCurrentTab('onboarding');
  };

  if (!sessionId) return <div>Loading...</div>;

  if (!loggedInUserId) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div style={{ 
      fontFamily: "'Pretendard', sans-serif", 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #0b1a6c 0%, #35158a 50%, #6830c2 100%)', 
      paddingBottom: '50px' 
    }}>
      <header style={{ padding: '40px 20px 20px 20px', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ margin: 0, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '32px', fontWeight: '800' }}>
            자기주도학습 <span style={{ color: '#82d7ff' }}>플랫폼</span>
          </h1>
          <p style={{ marginTop: '10px', color: '#d1c4e9', fontSize: '15px' }}>스스로 계획하고 실천하는 힘, 지금 시작하세요!</p>
        </div>
        <nav style={{ 
          display: 'flex', 
          flexWrap: 'nowrap', 
          gap: '5px', 
          background: '#fff', 
          padding: '10px 15px', 
          borderRadius: '50px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          width: '100%',
          maxWidth: '850px',
          justifyContent: 'space-between',
          overflowX: 'auto',
          scrollbarWidth: 'none'
        }}>
          <button 
            onClick={() => {
              setRescheduleId(null);
              setIsOnboarded(false);
              setCurrentTab('onboarding');
            }}
            style={{ 
              background: 'transparent', 
              color: currentTab === 'onboarding' ? '#1976d2' : '#555', 
              border: 'none', padding: '12px 20px', borderRadius: '40px', cursor: 'pointer', fontWeight: 'bold', flex: 1, whiteSpace: 'nowrap'
            }}
          >
            🪄 새 목표 설정 (Wizard)
          </button>
          <button 
            onClick={() => setCurrentTab('student')}
            style={{ 
              background: 'transparent', 
              color: currentTab === 'student' ? '#2e7d32' : '#555', 
              border: 'none', padding: '12px 20px', borderRadius: '40px', cursor: 'pointer', fontWeight: 'bold', flex: 1, whiteSpace: 'nowrap'
            }}
          >
            📈 나의 대시보드
          </button>
          <button 
            onClick={() => setCurrentTab('browser')}
            style={{ 
              background: 'transparent', 
              color: currentTab === 'browser' ? '#115293' : '#555', 
              border: 'none', padding: '12px 20px', borderRadius: '40px', cursor: 'pointer', fontWeight: 'bold', flex: 1, whiteSpace: 'nowrap'
            }}
          >
            📖 지식창고 탐색
          </button>
          <button 
            onClick={() => setCurrentTab('parent')}
            style={{ 
              background: 'transparent', 
              color: currentTab === 'parent' ? '#e65100' : '#555', 
              border: 'none', padding: '12px 20px', borderRadius: '40px', cursor: 'pointer', fontWeight: 'bold', flex: 1, whiteSpace: 'nowrap'
            }}
          >
            👥 학부모 참관
          </button>
        </nav>
      </header>

      <main style={{ padding: '0 20px' }}>
        {currentTab === 'onboarding' && (
          !isOnboarded ? (
            <GoalOnboardingForm 
              sessionId={sessionId} 
              userId={loggedInUserId}
              onComplete={() => setIsOnboarded(true)} 
            />
          ) : (
            <AIChatWizard 
              sessionId={sessionId} 
              rescheduleScheduleId={rescheduleId} 
              onFinalized={() => setCurrentTab('student')} 
            />
          )
        )}
        {currentTab === 'student' && <StudentDashboard sessionId={sessionId} onReschedule={handleReschedule} />}
        {currentTab === 'browser' && <KnowledgeBrowser />}
        {currentTab === 'parent' && <ParentDashboard />}
      </main>
    </div>
  );
}

export default App;
