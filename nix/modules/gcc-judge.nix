{ pkgs, ... }:

let
  # The compiler used for the judge (e.g. gcc16)
  judgeGcc = pkgs.gcc16;

  # Build the precompiled std module interface
  precompiledStd = pkgs.stdenv.mkDerivation {
    name = "gcc-precompiled-std";
    nativeBuildInputs = [ judgeGcc ];
    dontUnpack = true;

    buildPhase = ''
      mkdir -p $out/gcm.cache

      # 1. Compile bits/std.cc into a CMI using the exact judge flags
      g++ -O2 -std=c++26 -freflection -fmodules \
          -fmodule-only -c -fsearch-include-path bits/std.cc

      # 2. Optionally compile std.compat as well
      g++ -O2 -std=c++26 -freflection -fmodules \
          -fmodule-only -c -fsearch-include-path bits/std.compat.cc

      # Move the generated .gcm files into the package output
      cp gcm.cache/*.gcm $out/gcm.cache/

      # 3. Create a module map file mapping the module name to its .gcm path
      cat <<EOF > $out/modules.map
      std $out/gcm.cache/std.gcm
      std.compat $out/gcm.cache/std.compat.gcm
      EOF
    '';

    installPhase = "true";
  };

  judgeHeaders = pkgs.callPackage ../pkgs/judge-headers.nix { };

in
{
  environment.variables = {
    # Method A: Inject directly into CXXFLAGS
    CXXFLAGS = "-O2 -std=c++26 -freflection -fmodules -fmodule-mapper=${precompiledStd}/modules.map -isystem ${judgeHeaders}/include";

    # Method B: Use GCC's native module mapper environment variable
    # GCC will automatically read this file even if -fmodule-mapper isn't in argv
    CXX_MODULE_MAPPER = "${precompiledStd}/modules.map";
  };
}
