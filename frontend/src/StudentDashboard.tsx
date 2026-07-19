import { useState, useEffect } from 'react';
import axios from 'axios';
import AIExplainerTest from './AIExplainerTest';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

interface StudentDashboardProps {
  sessionId: string;
  onReschedule: (scheduleId: string) => void;
}

export default function StudentDashboard({ sessionId, onReschedule }: StudentDashboardProps) {
  const [schedule, setSchedule] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [testUnit, setTestUnit] = useState<{subject: string, unit: string} | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [activeWeekTab, setActiveWeekTab] = useState<number>(1);
  const [selectedSubject, setSelectedSubject] = useState<string>('전체');

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

  const toggleTask = async (weekNum: number, taskIdx: number) => {
    if (!schedule) return;
    
    // 낙관적 업데이트 (Optimistic UI)
    const newSchedule = { ...schedule };
    const week = newSchedule.payload.curriculum.find((w: any) => w.week_number === weekNum);
    const task = week.daily_tasks[taskIdx];
    const newCompleted = !task.completed;
    task.completed = newCompleted;
    setSchedule(newSchedule);
    
    try {
      await axios.patch(`${API_URL}/knowledge/schedule/${schedule.doc_id}/task`, {
        week_number: weekNum,
        task_index: taskIdx,
        completed: newCompleted
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

      {payload.spreadsheet_data?.subjects?.map((subj: any, idx: number) => {
        return (
          <div key={idx} style={{ marginBottom: '30px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ background: '#e3f2fd', padding: '15px 20px', borderBottom: '1px solid #ccc', fontWeight: 'bold', color: '#1565c0', display: 'flex', justifyContent: 'space-between' }}>
              <span>{subj.subject_name}</span>
              <span>과목 비중: {subj.weight_percent}%</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: '12px', textAlign: 'left' }}>단원명</th>
                    <th style={{ padding: '12px', textAlign: 'center', width: '80px' }}>비중</th>
                    <th style={{ padding: '12px', textAlign: 'center', width: '150px' }}>계획일</th>
                    <th style={{ padding: '12px', textAlign: 'center', width: '110px' }}>완료일</th>
                    <th style={{ padding: '12px', textAlign: 'center', width: '150px' }}>성취율</th>
                  </tr>
                </thead>
                <tbody>
                  {subj.units?.map((u: any, j: number) => {
                    // Extract tasks for this unit
                    const unitTasks: any[] = [];
                    payload.curriculum?.forEach((week: any) => {
                      week.daily_tasks?.forEach((task: any) => {
                        if (task.subject === subj.subject_name && task.unit_name === u.unit_name) {
                          unitTasks.push(task);
                        }
                      });
                    });

                    // Planned Date
                    let plannedDateStr = "-";
                    if (unitTasks.length > 0) {
                      const firstDate = unitTasks[0].date;
                      const lastDate = unitTasks[unitTasks.length - 1].date;
                      plannedDateStr = firstDate === lastDate ? firstDate : `${firstDate} ~ ${lastDate}`;
                    }

                    // Completed Date
                    let completedDateStr = "미완료";
                    if (unitTasks.length > 0) {
                      const allCompleted = unitTasks.every(t => t.completed);
                      if (allCompleted) {
                        // 가장 늦은 날짜 혹은 오늘 날짜 (간단히 가장 늦은 스케줄 날짜로 표시)
                        completedDateStr = unitTasks[unitTasks.length - 1].date;
                      }
                    }

                    // Score
                    const unitKey = `${subj.subject_name}_${u.unit_name}`;
                    const score = scores[unitKey];

                    return (
                      <tr key={j} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '12px 15px', borderRight: '1px solid #eee' }}>{u.unit_name}</td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#4caf50', borderRight: '1px solid #eee' }}>{u.weight_percent}%</td>
                        <td style={{ padding: '12px', textAlign: 'center', color: '#666', borderRight: '1px solid #eee' }}>{plannedDateStr}</td>
                        <td style={{ padding: '12px', textAlign: 'center', color: completedDateStr === "미완료" ? '#999' : '#2e7d32', fontWeight: completedDateStr !== "미완료" ? 'bold' : 'normal', borderRight: '1px solid #eee' }}>
                          {completedDateStr}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {score !== undefined ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                              <div style={{ width: '60px', background: '#eee', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${score}%`, background: score >= 80 ? '#4caf50' : '#ff9800', height: '100%' }} />
                              </div>
                              <span style={{ fontWeight: 'bold', color: '#333' }}>{score}점</span>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setTestUnit({subject: subj.subject_name, unit: u.unit_name})}
                              style={{ background: '#1976d2', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' }}
                            >
                              🎙️ 평가하기
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #eee', paddingBottom: '10px', marginTop: '40px', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: '#333' }}>일자별 스케줄 체크</h3>
        
        {/* Subject Filter */}
        <div style={{ display: 'flex', gap: '5px', overflowX: 'auto', paddingBottom: '5px' }}>
          {['전체', ...(payload.spreadsheet_data?.subjects?.map((s: any) => s.subject_name) || [])].map(subj => (
            <button
              key={subj}
              onClick={() => setSelectedSubject(subj)}
              style={{
                background: selectedSubject === subj ? '#1976d2' : '#f0f0f0',
                color: selectedSubject === subj ? '#fff' : '#555',
                border: 'none', padding: '6px 12px', borderRadius: '20px', cursor: 'pointer',
                fontWeight: selectedSubject === subj ? 'bold' : 'normal',
                whiteSpace: 'nowrap', fontSize: '13px'
              }}
            >
              {subj}
            </button>
          ))}
        </div>
      </div>
      
      {/* Week Tabs */}
      {payload.curriculum?.length > 0 && (
        <div style={{ display: 'flex', gap: '5px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
          {payload.curriculum.map((week: any) => (
            <button 
              key={week.week_number}
              onClick={() => setActiveWeekTab(week.week_number)}
              style={{
                background: activeWeekTab === week.week_number ? '#2e7d32' : '#e0e0e0',
                color: activeWeekTab === week.week_number ? '#fff' : '#333',
                border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer',
                fontWeight: activeWeekTab === week.week_number ? 'bold' : 'normal',
                whiteSpace: 'nowrap',
                fontSize: '15px'
              }}
            >
              Week {week.week_number}
            </button>
          ))}
        </div>
      )}

      {payload.curriculum?.filter((w: any) => w.week_number === activeWeekTab).map((week: any) => (
        <div key={week.week_number} style={{ marginBottom: '30px' }}>
          <h3 style={{ color: '#1565c0', borderBottom: '1px solid #bbdefb', paddingBottom: '10px' }}>Week {week.week_number}: {week.week_theme}</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px', marginTop: '20px' }}>
            {week.daily_tasks?.map((task: any, originalIdx: number) => ({ task, originalIdx }))
              .filter((item: any) => selectedSubject === '전체' || item.task.subject === selectedSubject)
              .map((item: any) => {
                const { task, originalIdx } = item;
                const isChecked = Boolean(task.completed);
                return (
                  <div key={originalIdx} style={{ background: '#fff', border: '1px solid #e0e0e0', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', color: '#888', fontWeight: 'bold' }}>{task.date} ({task.day})</span>
                      <span style={{ fontSize: '12px', background: '#e3f2fd', color: '#1565c0', padding: '2px 8px', borderRadius: '10px' }}>{task.subject}</span>
                    </div>
                    <h4 style={{ margin: '0 0 10px 0', color: isChecked ? '#aaa' : '#333', textDecoration: isChecked ? 'line-through' : 'none' }}>
                      {task.task_title.replace(' (진행중)', '').replace(' (완료)', '')}
                    </h4>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', color: '#666' }}>⏱ {task.estimated_minutes}분</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: isChecked ? '#4caf50' : '#666', fontWeight: 'bold' }}>
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => toggleTask(week.week_number, originalIdx)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        {isChecked ? '완료됨' : '미완료'}
                      </label>
                    </div>
                  </div>
                );
            })}
          </div>
        </div>
      ))}

      {testUnit && (
        <AIExplainerTest 
          sessionId={sessionId}
          subject={`${testUnit.subject} - ${testUnit.unit}`}
          onClose={() => setTestUnit(null)}
          onComplete={(score) => {
            const unitKey = `${testUnit.subject}_${testUnit.unit}`;
            setScores(prev => ({ ...prev, [unitKey]: score }));
          }}
        />
      )}
    </div>
  );
}
