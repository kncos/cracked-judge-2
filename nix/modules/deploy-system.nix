{
  pkgs,
  lib,
  config,
  ...
}:
{
  imports = [
    ./isolate.nix
    ./app.nix
  ];

  isolate.enable = true;
  services.app.enable = true;

  boot = {
    # loader.grub.enable = false;
    kernel = {
      sysctl = {
        "kernel.randomize_va_space" = 0;
        "kernel.core_pattern" = "/tmp/core.%e.%p";
        "fs.suid_dumpable" = 0;
        "vm.panic_on_oom" = 0;
      };
    };
  };

  environment = {
    # note: coreutils omitted, might be redundant here
    systemPackages = with pkgs; [
      fastfetch
      bash
      gcc16
      python314
      vim
      file
      htop
      bun
      socat
      file
      zip
      unzip
      tree
      (pkgs.callPackage ../pkgs/app.nix { }) # installs our application service
      (pkgs.callPackage ../pkgs/isolate-test-program.nix { })
      (pkgs.callPackage ../pkgs/hashdir.nix { })
    ];
  };

  systemd = {
    # interferes with ioi/isolate
    coredump.enable = false;
  };

  networking.firewall.allowedTCPPorts = [ 6379 ];

  services.redis.servers."" = {
    enable = true;
    bind = "0.0.0.0";
    requirePass = "password";
  };

  fileSystems = {
    "/" = {
      device = "/dev/vda";
      fsType = "ext4";
      options = [
        "rw"
        "relatime"
      ];
    };
  };

  users = {
    users = {
      root = {
        password = "";
      };
    };
  };
}
