import { T } from "../../styles/tokens";

export default function Card({ children, focused = false, style = {} }) {
  return (
    <div style={{
      background:   T.bgCard,
      borderRadius: T.radius.card,
      border:       focused
        ? `2px solid ${T.primary}`
        : `1px solid ${T.border}`,
      padding:      T.spacing.lg,
      boxShadow:    T.shadow.card,
      ...style,
    }}>
      {children}
    </div>
  );
}
