import { BattitoApplication } from "./Application";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Root element not found");
}

const application = new BattitoApplication(root);
application.start().catch((error: unknown) => {
  console.error(error);
  root.textContent = "No pudimos iniciar Battito. Recarga la página.";
});
