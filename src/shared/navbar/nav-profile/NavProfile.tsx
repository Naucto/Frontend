import { Box, Button, IconButton } from "@mui/material";
import AuthOverlay from "@shared/authOverlay/AuthOverlay";
import { CustomDialog } from "@shared/dialog/CustomDialog";
import { ProfileMenu } from "@shared/navbar/nav-profile/ProfileMenu";
import { useTheme } from "@theme/ThemeContext";
import { useCallback, useState } from "react";
import { useUser } from "src/providers/UserProvider";

const NavProfile: React.FC = () => {
  const theme = useTheme();
  const [showPopupMenu, setShowPopupMenu] = useState(false);
  const [anchorEl, setAnchorEl] = useState<undefined | HTMLElement>(undefined);
  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setShowPopupMenu((prev) => !prev);
    setAnchorEl(event.currentTarget);
  }, []);

  return (
    <>
      <IconButton onClick={handleClick}>
        <img className="navbar-logo" src={theme.logo.primary} alt="Logo" />
      </IconButton>
      {showPopupMenu && (
        <ProfileMenu anchorEl={anchorEl} open={showPopupMenu} onClose={() => setShowPopupMenu(false)} />
      )}
    </>
  );
};

export default NavProfile;
