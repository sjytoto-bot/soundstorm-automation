import { T } from "../../styles/tokens";

const LABEL = {
  done:    "완료",
  active:  "진행중",
  blocked: "보류",
  planned: "대기",
};

export default function StatusPill({ status }) {
  const s     = T.status[status] ?? T.status.planned;
  const label = LABEL[status]    ?? status;

  return (
    <span style={{
      fontSize:     T.font.label.size,
      fontWeight:   700,
      padding:      "4px 8px",
      borderRadius: T.radius.pill,
      background:   s.bg,
      color:        s.text,
      whiteSpace:   "nowrap",
      flexShrink:   0,
      lineHeight:   1.4,
    }}>
      {label}
    </span>
  );
}
