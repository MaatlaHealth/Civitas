import { redirect } from "next/navigation";

/** The assignment list lives at /crew; this keeps /crew/assignments working as an address. */
export default function CrewAssignmentsIndex() {
  redirect("/crew");
}
