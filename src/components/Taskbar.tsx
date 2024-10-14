import React, { useState, useEffect } from "react";
import "./css/Taskbar.css";

interface Task {
  id: string;
  pfp: string;
  name: string;
  status: string;
  onlineStatus: string;
}

interface TaskbarProps {
  taskIds: string[];
  selectedTaskIndex: number | null;
  onSelectTask: (index: number) => void;
}

const fallbackData: Task = {
  id: "fallback",
  pfp: "https://picsum.photos/200",
  name: "Ritalin Royale Käse",
  status: "Krabben Koitus",
  onlineStatus: "online",
};

const Taskbar: React.FC<TaskbarProps> = ({ taskIds, selectedTaskIndex, onSelectTask }) => {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const fetchedTasks = await Promise.all(
          taskIds.map(async (id) => {
            const url = `http://localhost/api/${id}`;
            const response = await fetch(url);
            const data: Task = await response.json();
            return data;
          })
        );
        setTasks(fetchedTasks);
      } catch (error) {
        console.error("Failed to fetch task data:", error);
        setTasks(Array(taskIds.length).fill(fallbackData));
      }
    };

    fetchTasks();
  }, [taskIds]);

  return (
    <div className="taskbar-container">
      {tasks.map((task, index) => (
        <div key={task.id} className="tt-container" onClick={() => onSelectTask(index)}>
          <div
            className={`task-container ${
              selectedTaskIndex === index ? "task-container-selected" : "task-container-unselected"
            }`}
          >
            <div className="image-container">
              <img src={task.pfp} alt={`${task.name}'s profile picture`} className="task-img" />
              <div className={`online-status-dot ${task.onlineStatus}`}></div>
            </div>
            <div className="inner-task-style">
              <h3 className="task-name">{task.name}</h3>
              <p className="task-status">{task.status}</p>
            </div>
          </div>
          <div
            className="connector-style"
            style={{ visibility: selectedTaskIndex === index ? "visible" : "hidden" }}
          />
        </div>
      ))}
    </div>
  );
};

export default Taskbar;
