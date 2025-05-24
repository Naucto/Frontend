
import { IconButton } from "@mui/material";
import ProfileMenu from "@shared/navbar/Profile/ProfileMenu";
import { useTheme } from "@theme/ThemeContext";
import { useState } from "react";

const NavProfile: React.FC = () => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  return (
    <div>
      <IconButton disableRipple onClick={(e) => setAnchorEl(e.currentTarget)}>
        <img className="navbar-logo" src={theme.logo.primary} alt="Logo" />
      </IconButton>
      <ProfileMenu
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
      />

    </div >

  );
};

export default NavProfile;
