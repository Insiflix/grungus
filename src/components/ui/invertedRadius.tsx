import React from "react";

interface InvertedRadiusProps {
  style?: React.CSSProperties;
}

const InvertedRadius: React.FC<InvertedRadiusProps> = ({ style }) => {
  
  const base : React.CSSProperties = {
    ...style,
  }

  return (
    <div style={base}></div>
  );
};

export default InvertedRadius;
