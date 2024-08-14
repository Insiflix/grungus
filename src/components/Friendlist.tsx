interface propsStyles {
  style?: React.CSSProperties;
}

const Friendlist: React.FC<propsStyles> = ({ style = {} }) => {
  const listContainer: React.CSSProperties = {
    height: "90.5vh",
    backgroundColor: "rgba(0, 0, 0, 0.60)",
    backdropFilter: "blur(2px)",
    WebkitBackdropFilter: "blur(2px)",
    borderRadius: "10px",
    width: "12.5rem",
    ...style,
  };
  return <div style={listContainer}></div>;
};

export default Friendlist;
