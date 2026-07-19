import { useState } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export default function ParentDashboard() {
  const [observerCode, setObserverCode] = useState("");
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
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
      if (resp.data.data.payload?.spreadsheet_data?.subjects?.length > 0) {
        setSelectedSubject(resp.data.data.payload.spreadsheet_data.subjects[0].subject_name);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || "코드를 찾을 수 없습니다.");
    }
    setLoading(false);
  };

  const payload = scheduleData?.payload || {};
  let flatTasks: any[] = [];
  payload.curriculum?.forEach((week: any) => {
    week.daily_tasks?.forEach((task: any, idx: number) => {
      flatTasks.push({ week_number: week.week_number, task_index: idx, ...task });
    });
  });

  const filteredTasks = flatTasks.filter((t: any) => t.subject === selectedSubject);

  return (
    <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '20px', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
      <h2 style={{ color: '#ff9800', textAlign: 'center', marginBottom: '10px' }}>👥 학부모 참관 대시보드</h2>
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

          {/* 과목 탭 */}
          <div style={{ display: 'flex', gap: '5px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '5px' }}>
            {(payload.spreadsheet_data?.subjects || []).map((subj: any) => (
              <button
                key={subj.subject_name}
                onClick={() => setSelectedSubject(subj.subject_name)}
                style={{
                  background: selectedSubject === subj.subject_name ? '#e65100' : '#ffe082',
                  color: selectedSubject === subj.subject_name ? '#fff' : '#e65100',
                  border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer',
                  fontWeight: selectedSubject === subj.subject_name ? 'bold' : 'normal',
                  whiteSpace: 'nowrap', fontSize: '15px'
                }}
              >
                {subj.subject_name}
              </button>
            ))}
          </div>

          {/* 스크롤 가능한 일자별 리스트 */}
          <div style={{ height: '400px', overflowY: 'auto', border: '1px solid #ffe082', borderRadius: '8px', background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#ffcc80', color: '#e65100', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', zIndex: 1 }}>
                <tr>
                  <th style={{ padding: '12px 15px', textAlign: 'left', borderBottom: '2px solid #ffb74d' }}>일자 (요일)</th>
                  <th style={{ padding: '12px 15px', textAlign: 'center', borderBottom: '2px solid #ffb74d' }}>배정시간</th>
                  <th style={{ padding: '12px 15px', textAlign: 'left', borderBottom: '2px solid #ffb74d' }}>단원명</th>
                  <th style={{ padding: '12px 15px', textAlign: 'center', borderBottom: '2px solid #ffb74d' }}>상태</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task, idx) => {
                  const isChecked = task.completed;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #fff3e0', background: isChecked ? '#fafafa' : '#fff', height: '52px' }}>
                      <td style={{ padding: '12px 15px', color: '#555', fontWeight: 'bold' }}>{task.date} ({(typeof task.day === 'string' && task.day.includes('- ')) ? task.day.split('- ')[1] : task.day || '?'})</td>
                      <td style={{ padding: '12px 15px', textAlign: 'center', color: '#888' }}>{task.estimated_minutes}분</td>
                      <td style={{ padding: '12px 15px', color: isChecked ? '#aaa' : '#333', textDecoration: isChecked ? 'line-through' : 'none' }}>{task.task_title}</td>
                      <td style={{ padding: '12px 15px', textAlign: 'center' }}>
                        {isChecked ? <span style={{ color: '#4caf50', fontWeight: 'bold' }}>✅ 완료</span> : <span style={{ color: '#ccc' }}>진행 전</span>}
                      </td>
                    </tr>
                  );
                })}
                {filteredTasks.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: '#999' }}>해당 과목의 일정이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div style={{ textAlign: 'center', marginTop: '30px', color: '#888', fontSize: '13px' }}>
            ※ 학부모 참관 모드에서는 자녀의 체크리스트를 임의로 수정할 수 없습니다.
          </div>
        </div>
      )}
    </div>
  );
}
