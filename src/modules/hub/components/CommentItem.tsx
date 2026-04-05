import React, { useState } from "react";
import { styled } from "@mui/material/styles";
import { Box, Typography, IconButton, TextField, Button } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import ReplyIcon from "@mui/icons-material/Reply";
import { CommentResponseDto } from "@api";
import { useUser } from "@providers/UserProvider";

const CommentContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  borderBottom: `1px solid ${theme.palette.grey[800]}`,
}));

const CommentHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: theme.spacing(0.5),
}));

const AuthorName = styled(Typography)(({ theme }) => ({
  fontWeight: 600,
  color: theme.palette.common.white,
  fontSize: "14px",
}));

const CommentDate = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[500],
  fontSize: "12px",
}));

const CommentContent = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[300],
  fontSize: "14px",
  lineHeight: 1.5,
}));

const ReplyContainer = styled(Box)(({ theme }) => ({
  marginLeft: theme.spacing(4),
  borderLeft: `2px solid ${theme.palette.grey[700]}`,
  paddingLeft: theme.spacing(2),
}));

const ReplyInput = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(1),
  marginTop: theme.spacing(1),
  marginLeft: theme.spacing(4),
}));

function formatTimeAgo(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

interface CommentItemProps {
  comment: CommentResponseDto;
  onReply: (commentId: number, content: string) => Promise<void>;
  onDelete: (commentId: number) => Promise<void>;
  isProjectCreator: boolean;
}

const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  onReply,
  onDelete,
  isProjectCreator,
}) => {
  const { user } = useUser();
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canDelete = !comment.deleted && user && (user.id === comment.author.id || isProjectCreator);

  const handleReply = async (): Promise<void> => {
    if (!replyContent.trim()) return;
    setSubmitting(true);
    try {
      await onReply(comment.id, replyContent);
      setReplyContent("");
      setShowReplyInput(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <CommentContainer>
        <CommentHeader>
          <Box display="flex" alignItems="center" gap={1}>
            <AuthorName>
              {comment.author.nickname ?? comment.author.username}
            </AuthorName>
            <CommentDate>{formatTimeAgo(comment.createdAt)}</CommentDate>
          </Box>
          <Box display="flex" alignItems="center">
            {user && !comment.deleted && (
              <IconButton
                size="small"
                onClick={() => setShowReplyInput(!showReplyInput)}
                sx={{ color: "grey.500" }}
              >
                <ReplyIcon fontSize="small" />
              </IconButton>
            )}
            {canDelete && (
              <IconButton
                size="small"
                onClick={() => onDelete(comment.id)}
                sx={{ color: "grey.500" }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        </CommentHeader>
        <CommentContent sx={comment.deleted ? { fontStyle: "italic", color: "grey.600" } : {}}>
          {comment.deleted ? "[Comment deleted]" : comment.content}
        </CommentContent>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <ReplyContainer>
            {comment.replies.map((reply) => (
              <Box key={reply.id} py={1}>
                <CommentHeader>
                  <Box display="flex" alignItems="center" gap={1}>
                    <AuthorName sx={{ fontSize: "13px" }}>
                      {reply.author.nickname ?? reply.author.username}
                    </AuthorName>
                    <CommentDate>{formatTimeAgo(reply.createdAt)}</CommentDate>
                  </Box>
                  {user && (user.id === reply.author.id || isProjectCreator) && (
                    <IconButton
                      size="small"
                      onClick={() => onDelete(reply.id)}
                      sx={{ color: "grey.500" }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </CommentHeader>
                <CommentContent sx={{ fontSize: "13px" }}>{reply.content}</CommentContent>
              </Box>
            ))}
          </ReplyContainer>
        )}
      </CommentContainer>

      {/* Reply input */}
      {showReplyInput && (
        <ReplyInput>
          <TextField
            size="small"
            placeholder="Write a reply..."
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            fullWidth
            sx={{
              "& .MuiInputBase-root": {
                color: "white",
                fontSize: "13px",
              },
            }}
          />
          <Button
            variant="contained"
            size="small"
            onClick={handleReply}
            disabled={submitting || !replyContent.trim()}
            sx={{ minWidth: "60px" }}
          >
            Reply
          </Button>
        </ReplyInput>
      )}
    </>
  );
};

export default CommentItem;
