import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export default function AdminDashboard() {
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  
  // Form fields
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [checkInTime, setCheckInTime] = useState('09:00');
  const [checkOutTime, setCheckOutTime] = useState('18:00');
  const [isManaged, setIsManaged] = useState(false);
  const [consultChecked, setConsultChecked] = useState(false);
  const [consultNote, setConsultNote] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const res = await axios.get(`${API_URL}/knowledge/admin/students`);
      if (res.data.status === 'success') {
        setStudents(res.data.data);
        if (res.data.data.length > 0) {
          const firstStd = res.data.data[0];
          setSelectedStudent(firstStd.user_id);
          setIsManaged(firstStd.form_data?.관리방식 === '관리형');
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (selectedStudent) {
      fetchAttendanceHistory(selectedStudent);
      const studentObj = students.find(s => s.user_id === selectedStudent);
      if (studentObj) {
        setIsManaged(studentObj.form_data?.관리방식 === '관리형');
        if (studentObj.form_data?.관리방식 !== '관리형') {
          setConsultChecked(false);
          setConsultNote('');
        }
      }
    }
  }, [selectedStudent, students]);

  const fetchAttendanceHistory = async (studentId: string) => {
    try {
      const res = await axios.get(`${API_URL}/knowledge/attendance/${studentId}`);
      if (res.data.status === 'success') {
        setAttendanceHistory(res.data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) {
      alert("학생을 선택해 주세요.");
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/knowledge/attendance`, {
        session_id: selectedStudent,
        date: date,
        check_in_time: checkInTime || null,
        check_out_time: checkOutTime || null,
        is_managed: isManaged,
        consult_checked: consultChecked,
        consult_note: consultNote
      });
      alert("출석 및 상담 정보가 저장되었습니다.");
      fetchAttendanceHistory(selectedStudent);
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '40px auto', padding: '20px', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', display: 'flex', gap: '30px' }}>
      
      {/* 학생 목록 사이드바 */}
      <div style={{ width: '250px', borderRight: '1px solid #eee', paddingRight: '20px' }}>
        <h3 style={{ color: '#1976d2', marginTop: 0 }}>👥 관리 대상 학생</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {students.map(s => (
            <button
              key={s.user_id}
              onClick={() => setSelectedStudent(s.user_id)}
              style={{
                textAlign: 'left', padding: '12px', borderRadius: '8px', border: selectedStudent === s.user_id ? '2px solid #1976d2' : '1px solid #ddd',
                background: selectedStudent === s.user_id ? '#e3f2fd' : '#fff', cursor: 'pointer',
                fontWeight: selectedStudent === s.user_id ? 'bold' : 'normal', color: '#333'
              }}
            >
              <div>📞 {s.user_id}</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                목표: {s.form_data?.목표 || '설정 전'}
              </div>
              <span style={{ fontSize: '11px', background: s.form_data?.관리방식 === '관리형' ? '#ffe0b2' : '#e0e0e0', color: s.form_data?.관리방식 === '관리형' ? '#e65100' : '#666', padding: '2px 6px', borderRadius: '4px', marginTop: '6px', display: 'inline-block' }}>
                {s.form_data?.관리방식 || '독학형'}
              </span>
            </button>
          ))}
          {students.length === 0 && (
            <div style={{ color: '#999', textAlign: 'center', padding: '20px' }}>등록된 학생이 없습니다.</div>
          )}
        </div>
      </div>

      {/* 출석 등록 및 이력 조회 */}
      <div style={{ flex: 1 }}>
        <h2 style={{ color: '#1976d2', marginTop: 0, borderBottom: '2px solid #eee', paddingBottom: '10px' }}>
          🏫 관리형 등하원 및 상담 일지 작성
        </h2>

        {selectedStudent ? (
          <div>
            <div style={{ background: '#f5f5f5', padding: '15px 20px', borderRadius: '8px', marginBottom: '25px', fontSize: '14px', color: '#555' }}>
              선택된 학생: <strong>{selectedStudent}</strong> ({isManaged ? '관리형 등록 학생' : '독학형 등록 학생'})
            </div>

            {/* 입력 폼 */}
            <form onSubmit={handleSaveAttendance} style={{ background: '#fcfcfc', border: '1px solid #eee', padding: '25px', borderRadius: '8px', marginBottom: '30px' }}>
              <h4 style={{ margin: '0 0 20px 0', color: '#333' }}>✏️ 오늘 출석 및 상담 내용 입력</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '13px', color: '#666' }}>날짜</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} required />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '13px', color: '#666' }}>등원 시간</label>
                  <input type="time" value={checkInTime} onChange={e => setCheckInTime(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '13px', color: '#666' }}>하원 시간</label>
                  <input type="time" value={checkOutTime} onChange={e => setCheckOutTime(e.target.value)} style={inputStyle} />
                </div>
              </div>

              {isManaged && (
                <div style={{ borderTop: '1px solid #ddd', paddingTop: '20px', marginTop: '20px', marginBottom: '20px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold', color: '#e65100', marginBottom: '12px' }}>
                    <input type="checkbox" checked={consultChecked} onChange={e => setConsultChecked(e.target.checked)} style={{ width: '18px', height: '18px' }} />
                    👩‍🏫 관리자 5분 메타인지 상담 완료
                  </label>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '13px', color: '#666' }}>상담 일지 / 특이사항</label>
                  <textarea
                    rows={3}
                    value={consultNote}
                    onChange={e => setConsultNote(e.target.value)}
                    placeholder="오늘 학습 상태 및 메타인지 상담 피드백을 기록하세요."
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{ background: '#1976d2', color: '#fff', border: 'none', padding: '12px 25px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}
              >
                {loading ? '저장 중...' : '💾 정보 저장하기'}
              </button>
            </form>

            {/* 출석 기록 */}
            <div>
              <h3 style={{ color: '#333', marginBottom: '15px' }}>📅 최근 등하원 및 상담 이력</h3>
              <div style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead style={{ background: '#f5f5f5' }}>
                    <tr>
                      <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>날짜</th>
                      <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>등원 시간</th>
                      <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>하원 시간</th>
                      <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>상담 여부</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>상담 일지</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceHistory.map(h => (
                      <tr key={h.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>{h.date}</td>
                        <td style={{ padding: '12px', textAlign: 'center', color: '#4caf50', fontWeight: 'bold' }}>{h.check_in_time || '-'}</td>
                        <td style={{ padding: '12px', textAlign: 'center', color: '#f44336', fontWeight: 'bold' }}>{h.check_out_time || '-'}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {h.is_managed ? (
                            h.consult_checked ? (
                              <span style={{ color: 'green', fontWeight: 'bold' }}>✅ 완료</span>
                            ) : (
                              <span style={{ color: 'red', fontWeight: 'bold' }}>❌ 미완료</span>
                            )
                          ) : (
                            <span style={{ color: '#999' }}>독학형</span>
                          )}
                        </td>
                        <td style={{ padding: '12px', color: '#666' }}>{h.consult_note || '-'}</td>
                      </tr>
                    ))}
                    {attendanceHistory.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#999' }}>출석 이력이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: '#999', textAlign: 'center', marginTop: '100px' }}>학생을 선택해 주세요.</div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '8px',
  border: '1px solid #ccc',
  boxSizing: 'border-box' as const,
  fontSize: '14px',
  outline: 'none'
};
