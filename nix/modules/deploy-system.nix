{
  pkgs,
  lib,
  config,
  ...
}:
{
  imports = [
    ./isolate.nix
  ];

  isolate.enable = true;

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
    ];
  };

  systemd = {
    # interferes with ioi/isolate
    coredump.enable = false;
  };

  services.redis.servers."" = {
    enable = true;
    bind = "127.0.0.1";
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
