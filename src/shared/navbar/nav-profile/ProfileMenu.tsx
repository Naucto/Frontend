import { styled } from "@mui/material";
import Menu from "@mui/material/Menu";
import { FC, useCallback } from "react";
import DisconnectIcon from "@assets/disconnect.svg?react";
import UserIcon from "@assets/user.svg?react";
import { ProfileMenuItem } from "@shared/navbar/nav-profile/ProfileMenuItem";
import { useUser } from "@providers/UserProvider";
import { useNavigate } from "react-router-dom";

type ProfileMenuProps = {
  anchorEl: undefined | HTMLElement;
  open: boolean;
  onClose: () => void;
};

const StyledMenu = styled(Menu)(({ theme }) => ({
  "& .MuiPaper-root": {
    boxShadow: "none",
    backgroundColor: theme.palette.gray[700],
    color: theme.palette.text.primary,
    borderRadius: theme.spacing(1),
    border: `3px solid ${theme.palette.gray[400]}`,
  },
  "& .MuiList-root": {
    padding: 0,
  },
  marginTop: theme.spacing(1)
}));

export const ProfileMenu: FC<ProfileMenuProps> = ({ anchorEl, open, onClose }) => {

  const { logOut } = useUser();
  const navigate = useNavigate();

  const handleLogOut = useCallback(() => {
    logOut();
    navigate(0);
  }, [logOut]);

  return (
    <StyledMenu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
    >
      <ProfileMenuItem icon={<UserIcon />} text="Profile" />
      <ProfileMenuItem icon={<DisconnectIcon />} text="Logout" onClick={handleLogOut} />
    </StyledMenu>
  );
};
