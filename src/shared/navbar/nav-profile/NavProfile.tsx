import { useUser } from "@providers/UserProvider";
import { ProfileMenu } from "@shared/navbar/nav-profile/ProfileMenu";
import { UserAvatar } from "@shared/user/UserAvatar";

import { useCallback, useState } from "react";

import { IconButton } from "@mui/material";

const NavProfile: React.FC = () => {
  const { user } = useUser();
  const [showPopupMenu, setShowPopupMenu] = useState(false);
  const [anchorEl, setAnchorEl] = useState<undefined | HTMLElement>(undefined);
  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setShowPopupMenu((prev) => !prev);
    setAnchorEl(event.currentTarget);
  }, []);

  return (
    <>
      <IconButton onClick={handleClick}>
        <UserAvatar username={user?.username} nickname={user?.nickname} size={48} />
      </IconButton>
      {showPopupMenu && (
        <ProfileMenu anchorEl={anchorEl} open={showPopupMenu} onClose={() => setShowPopupMenu(false)} />
      )}
    </>
  );
};

export default NavProfile;
