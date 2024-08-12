import { useState, useEffect } from "react";
import { HiOutlineX } from "react-icons/hi";

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
  name: "Ritalin Royale Käse",
  status: "Krabben Koitus",
  onlineStatus: "online",
};

const Task = ({ id }: TaskID) => {
  const [task, setTask] = useState<Task | null>(testData);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const url = `http://localhost/api/${id}`;
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
    margin: "10px 0 0 5px",
    display: "flex",
    borderRadius: "10px",
    backgroundColor: "rgba(148, 148, 148, 0.25)",
    backdropFilter: "blur(10px)",
    height: "6vh",
    minHeight: "50px",
    maxWidth: "14vw",
    alignItems: "center",
    padding: "5px",
    cursor: "pointer",
    position: "relative",
  };

  const imageContainer: React.CSSProperties = {
    position: "relative",
    marginRight: "5px",
  };

  const taskImg: React.CSSProperties = {
    height: "38px",
    minHeight: "38px",
    width: "38px",
    minWidth: "38px",
    borderRadius: "45px",
  };

  const onlineStatusDot: React.CSSProperties = {
    backgroundColor:
      {
        online: "#21B514", // Green for online
        offline: "#808080", // Grey for offline
        absent: "#FFA500", // Orange for absent
        busy: "#FF0000", // Red for busy
      }[task.onlineStatus] || "#FFFFFF",
    position: "absolute",
    height: "10px",
    width: "10px",
    right: "0px",
    bottom: "0px",
    borderRadius: "50%",
  };

  const taskName: React.CSSProperties = {
    margin: 0,
    fontWeight: "bold",
    color: "white",
    fontSize: "90%",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    width: "9.5vw",
  };

  const taskStatus: React.CSSProperties = {
    margin: 0,
    fontSize: "small",
    color: "#B4B4B4",
  };

  const iconStyle: React.CSSProperties = {
    margin: "0 0 0 auto",
    fontSize: "25px",
    cursor: "pointer",
  };

  return (
    <div style={taskContainer}>
      <div style={imageContainer}>
        <img
          src={task.pfp}
          alt={`${task.name}'s profile picture`}
          style={taskImg}
        />
        <div style={onlineStatusDot}></div>
      </div>
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
      <HiOutlineX style={iconStyle} />
    </div>
  );
};

export default Task;
