abi <abi/4.0>,
include <tunables/global>

profile heis /opt/heis/heis flags=(unconfined) {
  userns,
  include if exists <local/heis>
}
