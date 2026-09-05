{
  rustPlatform,
}:
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "isolate-test-program";
  version = "0.1.0";

  src = ../../isolate-test-program/.;

  cargoLock = {
    lockFile = ../../isolate-test-program/Cargo.lock;
  };

  release = true;
})
