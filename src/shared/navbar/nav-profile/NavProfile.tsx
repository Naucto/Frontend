import { Box, Button, IconButton, styled } from "@mui/material";
import AuthOverlay from "@shared/authOverlay/AuthOverlay";
import { CustomDialog } from "@shared/dialog/CustomDialog";
import { ProfileMenu } from "@shared/navbar/nav-profile/ProfileMenu";
import { useCallback, useState } from "react";
import { useUser } from "src/providers/UserProvider";

const LogoDiv = styled("div")(({ theme }) => ({
  width: 48,
  height: 48,
  backgroundImage: `url(${theme.custom.logo.primary})`,
  backgroundSize: "contain",
}));

const NavProfile: React.FC = () => {
  const [showPopupMenu, setShowPopupMenu] = useState(false);
  const [anchorEl, setAnchorEl] = useState<undefined | HTMLElement>(undefined);
  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setShowPopupMenu((prev) => !prev);
    setAnchorEl(event.currentTarget);
  }, []);

  return (
    <>
      <IconButton onClick={handleClick}>
        <LogoDiv />
      </IconButton>
      {showPopupMenu && (
        <ProfileMenu anchorEl={anchorEl} open={showPopupMenu} onClose={() => setShowPopupMenu(false)} />
      )}
    </>
  );
};

export default NavProfile;
