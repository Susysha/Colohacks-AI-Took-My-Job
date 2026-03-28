import { Text } from "react-native";
import { Badge, InsetCard, SectionCard } from "../ui/primitives";

export default function NurseWorkspace({ session }) {
  return (
    <>
      <SectionCard
        title="Nurse workspace"
        subtitle="This account is active and visible to the hospital admin, but QR generation and scanning stay doctor-only."
        tone="raised"
      >
        <Badge label={`Department: ${session.user.department || "Unassigned"}`} tone="default" />
      </SectionCard>

      <SectionCard
        title="Access policy"
        subtitle="Hospitals can create nurse accounts for staffing and identity control, while QR patient access remains restricted."
      >
        <InsetCard tone="strong">
          <Text>Your account can sign in, update its password, and stay visible in hospital staff management.</Text>
        </InsetCard>
      </SectionCard>
    </>
  );
}
