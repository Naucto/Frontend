import React, { useEffect, useState, useCallback } from "react";
import { styled } from "@mui/material/styles";
import { Box, Typography, TextField, Button, CircularProgress } from "@mui/material";
import CommentSvg from "@assets/comment.svg";
import {
  commentControllerGetComments,
  commentControllerCreateComment,
  commentControllerCreateReply,
  commentControllerDeleteComment,
  CommentResponseDto,
} from "@api";
import { useUser } from "@providers/UserProvider";
import CommentItem from "./CommentItem";
import {
  COMMENT_MAX_LENGTH,
  COMMENT_MAX_NEWLINES,
  countCommentNewlines,
  sanitizeCommentValue,
} from "./commentValidation";

const SectionContainer = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(3),
  backgroundColor: "rgba(10, 10, 10, 0.28)",
  borderRadius: theme.shape.borderRadius,
  overflow: "hidden",
  backdropFilter: "blur(8px)",
}));

const SectionHeader = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2, 3),
  borderBottom: `1px solid ${theme.palette.grey[800]}`,
}));

const CommentInputContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2, 3),
  borderBottom: `1px solid ${theme.palette.grey[800]}`,
  display: "flex",
  alignItems: "flex-start",
  gap: theme.spacing(1),
}));

const LoadMoreButton = styled(Button)(({ theme }) => ({
  width: "100%",
  padding: theme.spacing(1.5),
  color: theme.palette.grey[400],
  "&:hover": {
    color: theme.palette.common.white,
  },
}));

interface CommentSectionProps {
  projectId: number;
  projectCreatorId?: number;
}

const CommentSection: React.FC<CommentSectionProps> = ({
  projectId,
  projectCreatorId,
}) => {
  const { user } = useUser();
  const [comments, setComments] = useState<CommentResponseDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isProjectCreator = !!(user && projectCreatorId && user.id === projectCreatorId);

  const fetchComments = useCallback(
    async (pageNum: number, append: boolean = false): Promise<void> => {
      try {
        const { data } = await commentControllerGetComments({
          path: { projectId },
          query: { page: pageNum, limit: 20, sort: "newest" },
        });

        if (data) {
          setComments((prev) =>
            append ? [...prev, ...data.comments] : data.comments
          );
          setTotal(data.total);
        }
      } catch (error) {
        console.error("Error loading comments:", error);
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    fetchComments(1);
  }, [fetchComments]);

  const handlePostComment = async (): Promise<void> => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await commentControllerCreateComment({
        path: { projectId },
        body: { content: newComment },
      });
      if (data) {
        setComments((prev) => [data, ...prev]);
        setTotal((prev) => {
          const next = prev + 1;
          window.dispatchEvent(new CustomEvent("project-stats-updated", {
            detail: {
              projectId,
              changes: { commentCount: next }
            }
          }));
          return next;
        });
        setNewComment("");
      }
    } catch (error) {
      console.error("Error posting comment:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (
    commentId: number,
    content: string
  ): Promise<void> => {
    const { data } = await commentControllerCreateReply({
      path: { projectId, commentId },
      body: { content },
    });
    if (data) {
      // Add reply to the parent comment
      setTotal((prev) => {
        const next = prev + 1;
        window.dispatchEvent(new CustomEvent("project-stats-updated", {
          detail: {
            projectId,
            changes: { commentCount: next }
          }
        }));
        return next;
      });
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, replies: [...(c.replies || []), data] }
            : c
        )
      );
    }
  };

  const handleDelete = async (commentId: number): Promise<void> => {
    try {
      await commentControllerDeleteComment({
        path: { projectId, commentId },
      });
      // Update state based on whether comment was soft- or hard-deleted
      setComments((prev) => {
        const topComment = prev.find((c) => c.id === commentId);
        if (topComment) {
          setTotal((t) => {
            const next = t - 1;
            window.dispatchEvent(new CustomEvent("project-stats-updated", {
              detail: {
                projectId,
                changes: { commentCount: next }
              }
            }));
            return next;
          });
          if (topComment.replies && topComment.replies.length > 0) {
            // Soft-delete: replace with deleted placeholder
            return prev.map((c) =>
              c.id === commentId ? { ...c, deleted: true, content: "" } : c
            );
          }
          // Hard-delete: remove
          return prev.filter((c) => c.id !== commentId);
        }
        // Reply: hard-delete from parent
        setTotal((t) => {
          const next = t - 1;
          window.dispatchEvent(new CustomEvent("project-stats-updated", {
            detail: {
              projectId,
              changes: { commentCount: next }
            }
          }));
          return next;
        });
        return prev.map((c) => ({
          ...c,
          replies: c.replies?.filter((r) => r.id !== commentId),
        }));
      });
    } catch (error) {
      console.error("Error deleting comment:", error);
    }
  };

  const handleLoadMore = (): void => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchComments(nextPage, true);
  };

  const hasMore = comments.length < total;
  const commentNewlineCount = countCommentNewlines(newComment);

  return (
    <SectionContainer>
      <SectionHeader>
        <Box display="flex" alignItems="center" gap={1}>
          <img src={CommentSvg} width="20" height="20" style={{ imageRendering: "pixelated" }} alt="comments" />
          <Typography variant="h6" color="white">
            Comments ({total})
          </Typography>
        </Box>
      </SectionHeader>

      {/* Comment input (logged-in users only) */}
      {user ? (
        <CommentInputContainer>
          <TextField
            size="small"
            placeholder="Write a comment..."
            value={newComment}
            onChange={(e) => setNewComment(sanitizeCommentValue(e.target.value))}
            fullWidth
            multiline
            minRows={3}
            maxRows={12}
            helperText={`${newComment.length}/${COMMENT_MAX_LENGTH} chars • ${commentNewlineCount}/${COMMENT_MAX_NEWLINES} line breaks`}
            sx={{
              "& .MuiInputBase-root": {
                color: "white",
              },
              "& .MuiFormHelperText-root": {
                color: "rgba(255,255,255,0.65)",
                marginLeft: 0,
              },
            }}
          />
          <Button
            variant="contained"
            onClick={handlePostComment}
            disabled={submitting || !newComment.trim()}
            sx={{ minWidth: "80px", alignSelf: "flex-start", mt: 0.25 }}
          >
            {submitting ? <CircularProgress size={20} /> : "Post"}
          </Button>
        </CommentInputContainer>
      ) : (
        <Box px={3} py={2}>
          <Typography variant="body2" color="grey.500">
            Log in to leave a comment.
          </Typography>
        </Box>
      )}

      {/* Comments list */}
      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress size={24} />
        </Box>
      ) : comments.length === 0 ? (
        <Box px={3} py={4}>
          <Typography variant="body2" color="grey.500" textAlign="center">
            No comments yet. Be the first to comment!
          </Typography>
        </Box>
      ) : (
        <>
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onReply={handleReply}
              onDelete={handleDelete}
              isProjectCreator={isProjectCreator}
            />
          ))}
          {hasMore && (
            <LoadMoreButton onClick={handleLoadMore}>
              Load more comments...
            </LoadMoreButton>
          )}
        </>
      )}
    </SectionContainer>
  );
};

export default CommentSection;
