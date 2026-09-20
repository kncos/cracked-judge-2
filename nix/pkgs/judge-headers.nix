{ stdenv, ... }:
stdenv.mkDerivation {
  pname = "judge-headers";
  version = "1.0.0";

  # Relative to this file inside nix/pkgs/
  src = ../../judge-deps/cpp;

  dontBuild = true;

  installPhase = ''
    mkdir -p $out/include
    cp -r ./* $out/include/
  '';
}
