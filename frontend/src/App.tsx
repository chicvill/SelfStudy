import { useState, useEffect } from 'react';
import AIChatWizard from './AIChatWizard';
import KnowledgeBrowser from './KnowledgeBrowser';
import ParentDashboard from './ParentDashboard';
import StudentDashboard from './StudentDashboard';

const generateSessionId = () => "sess_" + Math.random().toString(36).substr(2, 9);

function App() {
  const [currentTab, setCurrentTab] = useState<'onboarding' | 'browser' | 'parent' | 'student'>('onboarding');
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

  const handleReschedule = (scheduleId: string) => {
    setRescheduleId(scheduleId);
    setCurrentTab('onboarding');
  };

  if (!sessionId) return <div>Loading...</div>;

  return (
    <div style={{ fontFamily: 'sans-serif', minHeight: '100vh', background: '#eef2f5' }}>
      <header style={{ background: '#1976d2', padding: '15px 20px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, color: '#1976d2', display: 'flex', alignItems: 'center', gap: '10px' }}>
          🚀 자기주도학습 플랫폼
        </h1>
        <nav style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => {
              setRescheduleId(null);
              setCurrentTab('onboarding');
            }}
            style={{ 
              background: currentTab === 'onboarding' ? '#1976d2' : 'transparent', 
              color: currentTab === 'onboarding' ? '#fff' : '#1976d2', border: '1px solid #1976d2', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' 
            }}
          >
            새 목표 설정 (Wizard)
          </button>
          <button 
            onClick={() => setCurrentTab('student')}
            style={{ 
              background: currentTab === 'student' ? '#2e7d32' : 'transparent', 
              color: currentTab === 'student' ? '#fff' : '#2e7d32', border: '1px solid #2e7d32', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' 
            }}
          >
            🏃 나의 대시보드
          </button>
          <button 
            onClick={() => setCurrentTab('browser')}
            style={{ 
              background: currentTab === 'browser' ? '#115293' : 'transparent', 
              color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' 
            }}
          >
            지식창고 탐색
          </button>
          <button 
            onClick={() => setCurrentTab('parent')}
            style={{ 
              background: currentTab === 'parent' ? '#e65100' : 'transparent', 
              color: '#fff', border: '1px solid #ffb74d', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' 
            }}
          >
            학부모 참관
          </button>
        </nav>
      </header>

      <main style={{ padding: '20px' }}>
        {currentTab === 'onboarding' && (
          <AIChatWizard 
            sessionId={sessionId} 
            rescheduleScheduleId={rescheduleId} 
            onFinalized={() => setCurrentTab('student')} 
          />
        )}
        {currentTab === 'student' && <StudentDashboard sessionId={sessionId} onReschedule={handleReschedule} />}
        {currentTab === 'browser' && <KnowledgeBrowser />}
        {currentTab === 'parent' && <ParentDashboard />}
      </main>
    </div>
  );
}

export default App;
