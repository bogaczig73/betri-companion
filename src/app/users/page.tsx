import { redirect } from "next/navigation";

import { UserManager } from "@/components/users/user-manager";
import { getAllCoachLinks } from "@/lib/access";
import { getActingUser, getAllUsers } from "@/lib/acting-user";

export default async function UsersPage() {
  const actingUser = await getActingUser();
  if (!actingUser || actingUser.role !== "coach") redirect("/");

  const [users, links] = await Promise.all([getAllUsers(), getAllCoachLinks()]);

  return (
    <UserManager users={users} links={links} actingUserId={actingUser.id} />
  );
}
