import { Box, Button, IconButton } from "@mui/material";
import AuthOverlay from "@shared/authOverlay/AuthOverlay";
import { CustomDialog } from "@shared/dialog/CustomDialog";
import { ProfileMenu } from "@shared/navbar/nav-profile/ProfileMenu";
import { useTheme } from "@theme/ThemeContext";
import { useCallback } from "react";
import { useState } from "react";
import { useUser } from "src/providers/UserProvider";

const NavProfile: React.FC = () => {
  const theme = useTheme();
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const [showBurgerMenu, setShowBurgerMenu] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const { user } = useUser();
  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (user) {
      setShowBurgerMenu((prev) => !prev);
      setAnchorEl(event.currentTarget);
    } else {
      setShowAuthOverlay((prev) => !prev);
    }
  }, [user]);

  return (
    <>
      <IconButton onClick={handleClick}>
        <img className="navbar-logo" src={theme.logo.primary} alt="Logo" />
      </IconButton>
      {showBurgerMenu && (
        <ProfileMenu anchorEl={anchorEl} open={showBurgerMenu} onClose={() => setShowBurgerMenu(false)} />
      )}
    </>
  );
};

export default NavProfile;
