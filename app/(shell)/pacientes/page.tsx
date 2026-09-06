import { Suspense } from "react";
import { PatientsPage } from "../../../src/views/PatientsPage";

export default function PatientsRoute() {
  return (
    <Suspense fallback={null}>
      <PatientsPage />
    </Suspense>
  );
}
