import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

interface StudentDashboardProps {
  sessionId: string;
  onReschedule: (scheduleId: string) => void;
}

export default function StudentDashboard({ sessionId, onReschedule }: StudentDashboardProps) {
  const [schedule, setSchedule] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchSchedule = async () => {
    try {
      const resp = await axios.get(`${API_URL}/knowledge/student/${sessionId}`);
      if (resp.data.data) {
        setSchedule(resp.data.data);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (sessionId) fetchSchedule();
  }, [sessionId]);

  const toggleTask = async (weekNum: number, day: string, taskIdx: number, currentCompleted: boolean) => {
    if (!schedule) return;
    
    // 낙관적 업데이트 (Optimistic UI)
    const newSchedule = { ...schedule };
    const week = newSchedule.payload.curriculum.find((w: any) => w.week_number === weekNum);
    const dayTasks = week.daily_tasks.filter((t: any) => t.day === day);
    dayTasks[taskIdx].completed = !currentCompleted;
    setSchedule(newSchedule);
    
    try {
      await axios.patch(`${API_URL}/knowledge/schedule/${schedule.doc_id}/task`, {
        week_number: weekNum,
        day: day,
        task_index: taskIdx,
        completed: !currentCompleted
      });
    } catch (err) {
      console.error(err);
      // 롤백 로직 생략 (프로토타입)
    }
  };

  if (loading) return <div>일정을 불러오는 중입니다...</div>;
  if (!schedule) return <div style={{ textAlign: 'center', marginTop: '50px' }}>확정된 일정이 없습니다. 대화형 온보딩을 완료해주세요!</div>;

  const payload = schedule.payload;

  return (
    <div style={{ maxWidth: '900px', margin: '20px auto', background: '#fff', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #eee', paddingBottom: '20px', marginBottom: '30px' }}>
        <div>
          <h2 style={{ color: '#1976d2', margin: '0 0 10px 0' }}>🏃 나의 진도 대시보드</h2>
          <p style={{ margin: 0, color: '#666' }}>[{payload.plan_title}]</p>
          <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: '#888' }}>부모님 참관 코드: <strong>{payload.observer_code}</strong></p>
        </div>
        <button 
          onClick={() => onReschedule(schedule.doc_id)}
          style={{ background: '#d32f2f', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          🚨 진도가 밀렸어요 (AI 재조정)
        </button>
      </div>

      <div style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>💡 AI 학습 전략</h4>
        <p style={{ margin: 0, color: '#555', fontSize: '14px', lineHeight: '1.5' }}>{payload.overall_strategy}</p>
      </div>

      {payload.curriculum?.map((week: any) => (
        <div key={week.week_number} style={{ marginBottom: '30px' }}>
          <h3 style={{ color: '#1565c0', borderBottom: '1px solid #bbdefb', paddingBottom: '10px' }}>Week {week.week_number}: {week.week_theme}</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px', marginTop: '15px' }}>
            {week.daily_tasks?.map((task: any, idx: number) => {
              // 실제 index가 배열 내의 몇 번째인지 보장하기 위해 (간단히)
              return (
                <div 
                  key={idx} 
                  style={{ 
                    background: task.completed ? '#e8f5e9' : '#fff', 
                    border: task.completed ? '1px solid #c8e6c9' : '1px solid #e0e0e0',
                    padding: '15px', 
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    transition: 'all 0.2s'
                  }}
                >
                  <input 
                    type="checkbox" 
                    checked={!!task.completed}
                    onChange={() => toggleTask(week.week_number, task.day, idx, !!task.completed)}
                    style={{ width: '20px', height: '20px', cursor: 'pointer', marginTop: '2px' }}
                  />
                  <div>
                    <strong style={{ color: task.completed ? '#2e7d32' : '#333', display: 'block', marginBottom: '5px' }}>{task.day}</strong>
                    <div style={{ fontSize: '14px', color: task.completed ? '#81c784' : '#555', textDecoration: task.completed ? 'line-through' : 'none' }}>
                      [{task.subject}] {task.task_title}
                    </div>
                    <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>⏱ {task.estimated_minutes}분</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
