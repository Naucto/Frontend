import { Menu, Box, Typography, MenuItem } from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import UserIcon from "@assets/user.svg?react";
import DisconnectIcon from "@assets/disconnect.svg?react";
import { useUser } from "src/providers/UserProvider";

const StyledMenu = styled(Menu)(({ theme }) => ({
  "& .MuiPaper-root": {
    backgroundColor: theme.palette.background.default,
    border: `2px solid ${theme.palette.grey[700]}`,
    width: "200px",
    boxShadow: "none",
    padding: theme.spacing(0),
  },
  "& .MuiList-root": {
    padding: theme.spacing(0),
  },
}));

const StyledMenuItem = styled(MenuItem)(({ theme }) => ({
  margin: theme.spacing(1),
  borderRadius: "8px",
  "&:hover": {
    backgroundColor: theme.palette.grey2
  },
  "&:focus": {
    backgroundColor: theme.palette.grey2,
  },
}));

const ProfileMenu: React.FC<{ anchorEl: HTMLElement | null, open: boolean, onClose: () => void }> = ({ anchorEl, open, onClose }) => {
  const { logout } = useUser();

  const handleLogout = (): void => {
    logout();
    console.log("User logged out");
  };

  return (
    <StyledMenu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
    >

      <StyledMenuItem>
        <UserIcon style={{ marginRight: "16px" }} />
        Profile
      </StyledMenuItem>
      <StyledMenuItem onClick={handleLogout}>
        <DisconnectIcon style={{ marginRight: "16px" }} />
        Disconnect
      </StyledMenuItem>

    </StyledMenu>
  );
};

export default ProfileMenu;
