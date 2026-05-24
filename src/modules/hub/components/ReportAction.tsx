import { type JSX, useState } from "react";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  TextField,
  Tooltip
} from "@mui/material";
import { type SxProps, type Theme } from "@mui/material/styles";
import { useSnackbar } from "notistack";
import { reportControllerCreate } from "@api";
import { useUser } from "@providers/UserProvider";

type ReportActionProps = {
  targetType: "USER" | "PROJECT" | "COMMENT";
  targetId: number;
  compact?: boolean;
};

const REPORT_REASONS = [
  "Harassment or hateful content",
  "Spam or scam",
  "Sexual or violent content",
  "Stolen or misleading content",
  "Other"
];

const reportDialogPaperSx: SxProps<Theme> = (theme) => ({
  backgroundColor: theme.palette.gray[800],
  color: theme.palette.common.white,
  border: `1px solid ${theme.palette.gray[500]}`,
  borderRadius: theme.custom.rounded.md,
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.55)",
});

const reportTextFieldSx: SxProps<Theme> = (theme) => ({
  "& .MuiInputLabel-root": {
    color: theme.palette.gray[200],
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: theme.palette.yellow[500],
  },
  "& .MuiOutlinedInput-root": {
    backgroundColor: theme.palette.gray[700],
    color: theme.palette.common.white,
    borderRadius: theme.custom.rounded.md,
    "& fieldset": {
      borderColor: theme.palette.gray[500],
    },
    "&:hover fieldset": {
      borderColor: theme.palette.gray[300],
    },
    "&.Mui-focused fieldset": {
      borderColor: theme.palette.yellow[500],
    },
  },
  "& .MuiInputBase-input": {
    color: theme.palette.common.white,
  },
  "& .MuiSelect-icon": {
    color: theme.palette.gray[200],
  },
});

const reportMenuPaperSx: SxProps<Theme> = (theme) => ({
  backgroundColor: theme.palette.gray[800],
  color: theme.palette.common.white,
  border: `1px solid ${theme.palette.gray[500]}`,
  borderRadius: theme.custom.rounded.md,
  "& .MuiMenuItem-root": {
    fontFamily: theme.typography.fontFamily,
    "&:hover": {
      backgroundColor: theme.palette.gray[700],
    },
    "&.Mui-selected": {
      backgroundColor: `${theme.palette.blue[700]} !important`,
      color: theme.palette.common.white,
    },
    "&.Mui-selected:hover": {
      backgroundColor: `${theme.palette.blue[600]} !important`,
    },
  },
});

export const ReportAction = ({
  targetType,
  targetId,
  compact = false,
}: ReportActionProps): JSX.Element => {
  const { user } = useUser();
  const { enqueueSnackbar } = useSnackbar();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleOpen = (): void => {
    if (!user) {
      enqueueSnackbar("Log in to report content.", { variant: "info" });
      return;
    }
    setOpen(true);
  };

  const submitReport = async (): Promise<void> => {
    setSubmitting(true);
    try {
      await reportControllerCreate({
        body: {
          targetType,
          targetId,
          reason,
          details: details.trim() || undefined
        }
      });
      enqueueSnackbar("Report submitted.", { variant: "success" });
      setOpen(false);
      setDetails("");
      setReason(REPORT_REASONS[0]);
    } catch (error) {
      console.error("Error submitting report:", error);
      enqueueSnackbar("Failed to submit report.", { variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {compact ? (
        <Tooltip title="Report">
          <IconButton size="small" onClick={handleOpen} sx={{ color: "grey.500" }}>
            <FlagOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          size="small"
          variant="text"
          startIcon={<FlagOutlinedIcon />}
          onClick={handleOpen}
          sx={{ color: "grey.300" }}
        >
          Report
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
        slotProps={{
          backdrop: {
            sx: {
              backgroundColor: "rgba(0, 0, 0, 0.72)",
              backdropFilter: "blur(4px)",
            },
          },
          paper: {
            sx: reportDialogPaperSx,
          },
        }}
      >
        <DialogTitle sx={{ color: "common.white", pb: 1 }}>Report content</DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "12px !important",
          }}
        >
          <TextField
            select
            label="Reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            sx={reportTextFieldSx}
            SelectProps={{
              MenuProps: {
                PaperProps: {
                  sx: reportMenuPaperSx,
                },
              },
            }}
          >
            {REPORT_REASONS.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Details"
            multiline
            minRows={4}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            inputProps={{ maxLength: 1000 }}
            sx={reportTextFieldSx}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)} sx={{ color: "gray.200" }}>
            Cancel
          </Button>
          <Button
            onClick={submitReport}
            disabled={submitting}
            variant="contained"
            sx={(theme) => ({
              backgroundColor: theme.palette.yellow[500],
              color: theme.palette.gray[900],
              "&:hover": {
                backgroundColor: theme.palette.yellow[400],
              },
              "&.Mui-disabled": {
                backgroundColor: theme.palette.gray[500],
                color: theme.palette.gray[300],
              },
            })}
          >
            {submitting ? "Submitting..." : "Submit"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
