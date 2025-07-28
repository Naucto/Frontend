export const generateRandomColor = (): string => {
  const colors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FECA57",
    "#FF9FF3", "#54A0FF", "#5F27CD", "#00D2D3", "#FF9F43",
    "#C44569", "#F8B500", "#6C5CE7", "#A29BFE", "#FD79A8"
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};
