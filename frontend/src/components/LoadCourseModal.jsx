// src/components/LoadCourseModal.jsx
import React, { useState } from 'react';
import { deleteCourse, updateCourse } from '../api/courseApi';
import { COLORS, SHADOWS } from '../styles/theme';
import Button from './ui/Button';
import { SPORTS, SPORT_IDS } from '../sports';

// 러닝을 지원하기 전에 저장한 코스에는 종목이 없으므로 자전거로 봅니다.
const courseSport = (course) => (SPORTS[course.sport] ? course.sport : 'bike');

const LoadCourseModal = ({ isOpen, onClose, courseList, onLoad, onRefresh }) => {
    const [editingId, setEditingId] = useState(null);
    const [editTitle, setEditTitle] = useState("");
    const [filter, setFilter] = useState('all');

    if (!isOpen) return null;

    const visibleCourses = filter === 'all' ? courseList : courseList.filter(course => courseSport(course) === filter);
    const filters = [['all', '전체'], ...SPORT_IDS.map(id => [id, `${SPORTS[id].icon} ${SPORTS[id].label}`])];

    const handleDelete = async (id) => {
        if (window.confirm("정말 이 코스를 삭제하시겠습니까? (복구 불가)")) {
            try {
                await deleteCourse(id);
                onRefresh();
            } catch { alert("삭제 실패"); }
        }
    };

    const startEdit = (course) => {
        setEditingId(course.id);
        setEditTitle(course.title);
    };

    const saveEdit = async (id) => {
        if (!editTitle.trim()) return alert("제목을 입력해주세요.");
        try {
            await updateCourse(id, editTitle);
            setEditingId(null);
            onRefresh();
        } catch { alert("수정 실패"); }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(2px)', // 배경 블러 효과
            padding: '16px'
        }}>
            <div style={{
                backgroundColor: COLORS.white,
                color: COLORS.textMain,
                borderRadius: '16px',
                width: 'min(560px, 100%)', maxHeight: '80vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: SHADOWS.modal,
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px',
                    borderBottom: `1px solid ${COLORS.border}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, fontSize: '20px', color: COLORS.primary }}>
                        📂 내 코스
                    </h2>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '24px', cursor: 'pointer', color: COLORS.textSub }}>
                        &times;
                    </button>
                </div>

                {/* Filter */}
                <div role="tablist" aria-label="종목별 보기" style={{ display: 'flex', gap: '6px', padding: '12px 20px 0' }}>
                    {filters.map(([id, label]) => (
                        <button
                            key={id}
                            role="tab"
                            aria-selected={filter === id}
                            onClick={() => setFilter(id)}
                            style={{
                                padding: '5px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                                border: `1px solid ${filter === id ? COLORS.primary : COLORS.border}`,
                                backgroundColor: filter === id ? COLORS.primary : COLORS.white,
                                color: filter === id ? COLORS.white : COLORS.textSub,
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* List */}
                <div style={{ overflowY: 'auto', flex: 1, padding: '10px' }}>
                    {visibleCourses.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: COLORS.textSub }}>
                            저장된 코스가 없습니다.<br />새로운 코스를 만들어보세요!
                        </div>
                    ) : (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {visibleCourses.map(course => (
                                <li key={course.id} style={{
                                    border: `1px solid ${COLORS.border}`,
                                    borderRadius: '8px',
                                    padding: '16px',
                                    marginBottom: '10px',
                                    display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', alignItems: 'center',
                                    backgroundColor: COLORS.background,
                                    borderLeft: `4px solid ${SPORTS[courseSport(course)].color}`
                                }}>
                                    {editingId === course.id ? (
                                        // 수정 모드
                                        <div style={{ display: 'flex', gap: '8px', flex: 1, width: '100%' }}>
                                            <input
                                                type="text"
                                                value={editTitle}
                                                onChange={(e) => setEditTitle(e.target.value)}
                                                style={{
                                                    flex: 1, padding: '8px', borderRadius: '6px',
                                                    border: `1px solid ${COLORS.primary}`, outline: 'none'
                                                }}
                                                autoFocus
                                            />
                                            <Button size="small" onClick={() => saveEdit(course.id)}>저장</Button>
                                            <Button size="small" variant="outline" onClick={() => setEditingId(null)}>취소</Button>
                                        </div>
                                    ) : (
                                        // 일반 모드
                                        <>
                                            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                                                <div style={{ fontWeight: '700', fontSize: '16px', color: COLORS.textMain, marginBottom: '4px', overflowWrap: 'anywhere' }}>
                                                    {course.title}
                                                </div>
                                                <div style={{ fontSize: '12px', color: COLORS.textSub }}>
                                                    {SPORTS[courseSport(course)].icon} {SPORTS[courseSport(course)].label} · {new Date(course.created_at).toLocaleDateString()} 생성
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <Button size="small" onClick={() => onLoad(course)}>불러오기</Button>
                                                <Button size="small" variant="secondary" onClick={() => startEdit(course)}>이름 변경</Button>
                                                <Button size="small" variant="danger" onClick={() => handleDelete(course.id)}>삭제</Button>
                                            </div>
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LoadCourseModal;