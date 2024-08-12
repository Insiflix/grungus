import { useState, useEffect } from "react";

interface Task {
  pfp: string;
  name: string;
  status: string;
  onlineStatus: string;
}

interface TaskID {
  id: string;
}

const testData: Task = {
  pfp: "https://picsum.photos/200",
  name: "Hans Hummer",
  status: "Fickt deine Mutter",
  onlineStatus: "online",
};

const Task = ({ id }: TaskID) => {
  const [task, setTask] = useState<Task | null>(testData);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const url = `https://api.example.com/tasks/${id}`;
        const response = await fetch(url);
        const data: Task = await response.json();
        setTask(data);
      } catch (error) {
        console.error("Failed to fetch task data:", error);
      }
    };

    fetchData();
  }, [id]);

  if (!task) {
    return null;
  }

  const taskContainer: React.CSSProperties = {
    margin: "1vh 0 0 0",
    display: "flex",
    borderRadius: "10px",
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    backdropFilter: "blur(2px)",
    border: "solid 2px rgba(255, 255, 255, 0.20)",
    height: "6vh",
    alignItems: "center",
    padding: "3px 10px",
  };

  let statusColor;
  switch (task.onlineStatus) {
    case "online":
      statusColor = "#00FF00"; // Green for online
      break;
    case "offline":
      statusColor = "#808080"; // Grey for offline
      break;
    case "absent":
      statusColor = "#FFA500"; // Orange for absent
      break;
    case "busy":
      statusColor = "#FF0000"; // Red for busy
      break;
    default:
      statusColor = "#FFFFFF"; // Default to white if no status is matched
  }
  const taskImg: React.CSSProperties = {
    height: "100%",
    borderRadius: "45px",
    marginRight: "10px",
    border: `2px solid ${statusColor}`,
  };

  const taskName: React.CSSProperties = {
    margin: 0,
    fontWeight: "bold",
  };

  const taskStatus: React.CSSProperties = {
    margin: 0,
    fontSize: "small",
    color: "white",
  };

  return (
    <div style={taskContainer}>
      <img
        src={task.pfp}
        alt={`${task.name}'s profile picture`}
        style={taskImg}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <h3 style={taskName}>{task.name}</h3>
        <p style={taskStatus}>{task.status}</p>
      </div>
    </div>
  );
};

export default Task;
