import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { assignedTaskService, AssignedTask, TaskComment } from '../../services/assignedTask.service';
import './TaskCommentsDialog.css';

export default function TaskCommentsDialog({ task, onClose }: { task: AssignedTask; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    ref.current?.showModal();
    let alive = true;
    assignedTaskService.listComments(task.id).then(rows => {
      if (alive) { setComments(rows); setLoading(false); }
    }).catch(e => {
      if (alive) { setError(e instanceof Error ? e.message : 'Could not load comments.'); setLoading(false); }
    });
    return () => { alive = false; };
  }, [task.id]);

  return <dialog ref={ref} className="task-comments-dialog" aria-labelledby="taskCommentsTitle"
    onCancel={e => { e.preventDefault(); onClose(); }}>
    <div className="task-comments-grab" aria-hidden="true" />
    <div className="task-comments-heading">
      <h2 id="taskCommentsTitle">Previous employee comments</h2>
      <button type="button" aria-label="Close comments" onClick={onClose}><X size={20} /></button>
    </div>
    <p className="task-comments-task">{task.description}</p>
    {loading ? <p className="task-comments-state" role="status">Loading comments…</p>
      : error ? <p className="task-comments-state error" role="alert">{error}</p>
      : comments.length ? <div className="task-comments-list">{comments.map(comment => <article key={comment.id} className="task-comment">
          <div className="task-comment-body"><b>{comment.kind === 'STUCK' ? 'Stuck' : 'Done'}:</b> {comment.body}</div>
          {comment.kind === 'STUCK' && comment.progress !== null && <span className="task-comment-progress">{comment.progress}% done</span>}
          <div className="task-comment-meta">{comment.author_name} · <time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</time></div>
        </article>)}</div>
      : <p className="task-comments-state">No comments on this task yet.</p>}
  </dialog>;
}
