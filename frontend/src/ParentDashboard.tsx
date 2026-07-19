import { useState } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export default function ParentDashboard() {
  const [observerCode, setObserverCode] = useState("");
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!observerCode.trim()) return;
    
    setLoading(true);
    setErrorMsg("");
    setScheduleData(null);
    
    try {
      const resp = await axios.get(`${API_URL}/knowledge/observe/${observerCode}`);
      setScheduleData(resp.data.data);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || "코드를 찾을 수 없습니다.");
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
      <h2 style={{ color: '#ff9800', textAlign: 'center', marginBottom: '10px' }}>👪 학부모 모니터링 대시보드</h2>
      <p style={{ color: '#666', textAlign: 'center', marginBottom: '30px' }}>자녀가 공유해준 6자리 참관 코드를 입력하세요.</p>
      
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '30px' }}>
        <input 
          type="text" 
          value={observerCode}
          onChange={e => setObserverCode(e.target.value.toUpperCase())}
          placeholder="예: A1B2C3" 
          maxLength={6}
          style={{ width: '200px', padding: '12px', borderRadius: '8px', border: '2px solid #ccc', textAlign: 'center', fontSize: '18px', letterSpacing: '2px', textTransform: 'uppercase' }}
        />
        <button 
          type="submit" 
          disabled={loading || observerCode.length < 6}
          style={{ background: '#ff9800', color: '#fff', border: 'none', padding: '0 25px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
        >
          {loading ? '조회 중...' : '조회하기'}
        </button>
      </form>

      {errorMsg && <div style={{ color: 'red', textAlign: 'center', marginBottom: '20px' }}>{errorMsg}</div>}

      {scheduleData && (
        <div style={{ background: '#fff8e1', padding: '25px', borderRadius: '12px', border: '1px solid #ffe082' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #ffcc80', paddingBottom: '15px', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: '#e65100' }}>{scheduleData.payload.plan_title || "진도 계획"}</h3>
            <span style={{ background: '#ffcc80', color: '#e65100', padding: '5px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
              🔒 읽기 전용 (참관 모드)
            </span>
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <strong>학습 전략:</strong> {scheduleData.payload.overall_strategy}
          </div>

          <h4 style={{ color: '#e65100' }}>주차별 커리큘럼 요약</h4>
          {scheduleData.payload.curriculum?.map((week: any) => (
            <div key={week.week_number} style={{ background: '#fff', padding: '15px', borderRadius: '8px', marginBottom: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <h5 style={{ margin: '0 0 10px 0', color: '#333' }}>Week {week.week_number}: {week.week_theme}</h5>
              <ul style={{ paddingLeft: '20px', margin: 0, color: '#555', fontSize: '14px' }}>
                {week.daily_tasks?.map((task: any, idx: number) => (
                  <li key={idx} style={{ marginBottom: '8px' }}>
                    <span style={{ display: 'inline-block', width: '80px', fontWeight: 'bold' }}>{task.day}</span>
                    <span>[{task.subject}] {task.task_title} ({task.estimated_minutes}분)</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          
          <div style={{ textAlign: 'center', marginTop: '30px', color: '#888', fontSize: '13px' }}>
            ※ 학부모 참관 모드에서는 자녀의 체크리스트를 임의로 수정할 수 없습니다.
          </div>
        </div>
      )}
    </div>
  );
}
