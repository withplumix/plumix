export const Static = () => <div style={{ display: "flex" }} />;
export const Custom = ({ depth }: { depth: number }) => (
  <div style={{ "--depth": depth }} />
);
