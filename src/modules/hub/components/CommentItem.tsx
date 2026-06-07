import React, { useState } from "react";
import { styled } from "@mui/material/styles";
import { Box, Typography, IconButton } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import ReplyIcon from "@mui/icons-material/Reply";
import { CommentResponseDto } from "@api";
import { useUser } from "@providers/UserProvider";
import CommentComposer from "./CommentComposer";
import { UserProfileLink } from "@shared/user/UserProfileLink";

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

const CommentDate = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[500],
  fontSize: "12px",
}));

const CommentContent = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[300],
  fontSize: "14px",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
}));

const CommentAuthorMeta = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1),
  minWidth: 0,
}));

const CommentBody = styled(Box)(({ theme }) => ({
  marginLeft: theme.spacing(5.5),
}));

const ReplyContainer = styled(Box)(({ theme }) => ({
  marginLeft: theme.spacing(4),
  borderLeft: `2px solid ${theme.palette.grey[700]}`,
  paddingLeft: theme.spacing(2),
}));

const ReplyBody = styled(Box)(({ theme }) => ({
  marginLeft: theme.spacing(4.5),
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
          <CommentAuthorMeta>
            <UserProfileLink user={comment.author} showAvatar avatarSize={36} />
            <CommentDate>{formatTimeAgo(comment.createdAt)}</CommentDate>
          </CommentAuthorMeta>
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
        <CommentBody>
          <CommentContent sx={comment.deleted ? { fontStyle: "italic", color: "grey.600" } : {}}>
            {comment.deleted ? "[Comment deleted]" : comment.content}
          </CommentContent>
        </CommentBody>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <ReplyContainer>
            {comment.replies.map((reply) => (
              <Box key={reply.id} py={1}>
                <CommentHeader>
                  <CommentAuthorMeta>
                    <UserProfileLink
                      user={reply.author}
                      showAvatar
                      avatarSize={28}
                      nameVariant="caption"
                    />
                    <CommentDate>{formatTimeAgo(reply.createdAt)}</CommentDate>
                  </CommentAuthorMeta>
                  {!reply.deleted && user && (user.id === reply.author.id || isProjectCreator) && (
                    <IconButton
                      size="small"
                      onClick={() => onDelete(reply.id)}
                      sx={{ color: "grey.500" }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </CommentHeader>
                <ReplyBody>
                  <CommentContent sx={reply.deleted ? { fontSize: "13px", fontStyle: "italic", color: "grey.600" } : { fontSize: "13px" }}>
                    {reply.deleted ? "[Comment deleted]" : reply.content}
                  </CommentContent>
                </ReplyBody>
              </Box>
            ))}
          </ReplyContainer>
        )}
      </CommentContainer>

      {/* Reply input */}
      {showReplyInput && (
        <ReplyInput>
          <CommentComposer
            compact
            value={replyContent}
            onChange={setReplyContent}
            onSubmit={handleReply}
            placeholder="Write a reply..."
            submitLabel="Reply"
            minRows={2}
            maxRows={8}
            submitting={submitting}
          />
        </ReplyInput>
      )}
    </>
  );
};

export default CommentItem;
