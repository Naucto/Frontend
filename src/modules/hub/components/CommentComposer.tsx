import React from "react";
import { styled } from "@mui/material/styles";
import { Box, Button, CircularProgress, TextField } from "@mui/material";
import {
  COMMENT_MAX_LENGTH,
  COMMENT_MAX_NEWLINES,
  countCommentNewlines,
  sanitizeCommentValue,
} from "./commentValidation";

const ComposerRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "flex-start",
  gap: theme.spacing(1),
  width: "100%",
}));

const ComposerTextField = styled(TextField, {
  shouldForwardProp: (prop) => prop !== "$compact",
})<{ $compact?: boolean }>(({ $compact }) => ({
  "& .MuiInputBase-root": {
    color: "white",
    fontSize: $compact ? "13px" : undefined,
  },
  "& .MuiFormHelperText-root": {
    color: "rgba(255,255,255,0.65)",
    marginLeft: 0,
  },
}));

const ComposerButton = styled(Button, {
  shouldForwardProp: (prop) => prop !== "$compact",
})<{ $compact?: boolean }>(({ $compact }) => ({
  minWidth: $compact ? "60px" : "80px",
  alignSelf: "flex-start",
  marginTop: $compact ? 0 : 2,
}));

interface CommentComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => Promise<void> | void;
  placeholder: string;
  submitLabel: string;
  minRows: number;
  maxRows: number;
  submitting?: boolean;
  compact?: boolean;
}

const CommentComposer: React.FC<CommentComposerProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  submitLabel,
  minRows,
  maxRows,
  submitting = false,
  compact = false,
}) => {
  const newlineCount = countCommentNewlines(value);

  return (
    <ComposerRow>
      <ComposerTextField
        $compact={compact}
        size="small"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(sanitizeCommentValue(event.target.value))}
        fullWidth
        multiline
        minRows={minRows}
        maxRows={maxRows}
        helperText={`${value.length}/${COMMENT_MAX_LENGTH} chars • ${newlineCount}/${COMMENT_MAX_NEWLINES} line breaks`}
      />
      <ComposerButton
        $compact={compact}
        variant="contained"
        size={compact ? "small" : "medium"}
        onClick={onSubmit}
        disabled={submitting || !value.trim()}
      >
        {submitting ? <CircularProgress size={compact ? 16 : 20} /> : submitLabel}
      </ComposerButton>
    </ComposerRow>
  );
};

export default CommentComposer;
