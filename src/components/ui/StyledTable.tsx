import {
  styled,
  Table,
  TableRow,
  TableCell,
  TableRowProps
} from "@mui/material";

export const StyledTable = styled(Table)({
  tableLayout: "auto"
});

export interface StyledTableRowProps extends TableRowProps {
  hoverable?: boolean;
}

export const StyledTableRow = styled(TableRow, {
  shouldForwardProp: (prop) => prop !== "hoverable",
})<StyledTableRowProps>(({ theme }) => ({
  variants: [
    {
      props: { hoverable: true },
      style: {
        "&:hover": {
          cursor: "pointer",
          backgroundColor: theme.palette.action?.hover
        },
      },
    },
  ],
}));

export const StyledTableCell = styled(TableCell)(({ theme }) => ({
  padding: 0,
  paddingLeft: theme.spacing(0.5),
  paddingRight: theme.spacing(0.5),

  "& > *": {
    verticalAlign: "middle"
  }
}));

export const StyledGrownTableCell = styled(StyledTableCell)({
  width: "100%",
});
