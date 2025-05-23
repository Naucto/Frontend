
import { IconButton } from "@mui/material";
import AuthOverlay from "@shared/authOverlay/AuthOverlay";
import { useTheme } from "@theme/ThemeContext";
import { useCallback } from "react";
import { useState } from "react";

const NavProfil: React.FC = () => {
  const theme = useTheme();
  const [showAuthOverlay, setShowAuthOverlay] = useState(true);

  const handleClick = useCallback(() => {
    setShowAuthOverlay((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setShowAuthOverlay(false);
  }, []);

  return (
    <div>
      <IconButton onClick={handleClick} disableRipple>
        <img className="navbar-logo" src={theme.logo.primary} alt="Logo" />
      </IconButton>

      {showAuthOverlay && (
        <AuthOverlay onClose={handleClose} />)}
    </div>

  );
};

export default NavProfil;
