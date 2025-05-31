import { IconButton } from "@mui/material";
import AuthOverlay from "@shared/authOverlay/AuthOverlay";
import { CustomDialog } from "@shared/dialog/CustomDialog";
import { useTheme } from "@theme/ThemeContext";
import { useCallback } from "react";
import { useState } from "react";

const NavProfile: React.FC = () => {
  const theme = useTheme();
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  const handleClick = useCallback(() => {
    setShowAuthOverlay((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setShowAuthOverlay(false);
  }, []);

  return (
    <>
      <IconButton onClick={handleClick} disableRipple>
        <img className="navbar-logo" src={theme.logo.primary} alt="Logo" />
      </IconButton>
      {showAuthOverlay && (
        <AuthOverlay isOpen={showAuthOverlay} setIsOpen={setShowAuthOverlay} />
      )}
    </>
  );
};

export default NavProfile;
