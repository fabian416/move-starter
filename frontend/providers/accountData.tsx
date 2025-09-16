import { useToast } from "@/components/ui/use-toast";
import { REWARD_CREATOR_ADDRESS } from "@/constants";
import { useGetStakePoolData } from "@/hooks/useGetStakePoolData";
import { useGetTokenData } from "@/hooks/useGetTokenData";
import { convertAmountFromOnChainToHumanReadable } from "@/utils/helpers";
import { getAccountTokenBalance } from "@/view-functions/getAccountTokenAmount";
import { getClaimableRewards } from "@/view-functions/getClaimableRewards";
import { getUserHasStake } from "@/view-functions/getUserHasStake";
import { getUserStakeData } from "@/view-functions/getUserStakeData";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { PropsWithChildren, createContext, useEffect, useState } from "react";

export interface AccountDataDataProviderState {
  hasStake: boolean;
  hasRewards: boolean;
  claimableRewards: number;
  accountStakeAmount: number;
  isCreator: boolean;
  accountTokenBalance: string;
}

const defaultValues: AccountDataDataProviderState = {
  hasStake: false,
  hasRewards: false,
  claimableRewards: 0,
  accountStakeAmount: 0,
  isCreator: false,
  accountTokenBalance: "0",
};

export const AccountDataContext = createContext<AccountDataDataProviderState>(defaultValues);

// Helper to convert errors to a message
function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try { return JSON.stringify(e); } catch { return String(e); }
}

export const AccountDataContextProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const { account, connected } = useWallet();
  const { tokenData } = useGetTokenData();
  const { toast } = useToast();
  const { existsRewardSchedule } = useGetStakePoolData();

  const [hasStake, setHasStake] = useState<boolean>(false);
  const [hasRewards, setHasRewards] = useState<boolean>(false);
  const [claimableRewards, setClaimableRewards] = useState<number>(0);
  const [accountStakeAmount, setAccountStakeAmount] = useState<number>(0);
  const [isCreator, setIsCreator] = useState<boolean>(false);
  const [accountTokenBalance, setAccountTokenBalance] = useState<string>("0");

  // ✅ We gate the query and guarantee a default value
  const enabled = !!connected && !!account?.address;

  const { data = defaultValues } = useQuery({
    queryKey: [
      "account-data-context",
      account?.address ?? null,          // avoid passing the entire object (fewer renders)
      Boolean(existsRewardSchedule),
    ],
    enabled,
    refetchInterval: 1000 * 30,
    queryFn: async (): Promise<AccountDataDataProviderState> => {
      try {
        if (!account?.address) return defaultValues;
    
        const addr = String(account.address);
    
        // Claimable rewards
        let claimableRewards = 0;
        if (existsRewardSchedule) {
          claimableRewards = await getClaimableRewards(addr);
        }
        const hasRewards = claimableRewards > 0; // ✅ calculate hasRewards
    
        // Does he have a stake?
        const userHasStake = await getUserHasStake(addr); // ✅ renamed
    
        // Stake data (if applicable)
        let accountStakeAmount = 0;
        if (userHasStake) {
          const accountStakeData = await getUserStakeData(addr);
          accountStakeAmount = convertAmountFromOnChainToHumanReadable(
            parseInt(accountStakeData?.amount ?? "0", 10),
            tokenData?.decimals ?? 0,
          );
        }
    
        // Is it the creator?
        const isCreator =
          !!REWARD_CREATOR_ADDRESS &&
          addr.toLowerCase() === REWARD_CREATOR_ADDRESS.toLowerCase();
    
        // Token balance in human format
        const onChainBalance = await getAccountTokenBalance(addr);
        const accountTokenBalance = convertAmountFromOnChainToHumanReadable(
          onChainBalance,
          tokenData?.decimals ?? 0,
        ).toLocaleString(undefined, {
          minimumFractionDigits: 4,
          maximumFractionDigits: 4,
        });
    
        return {
          claimableRewards,
          hasRewards,              // ✅ now exists
          hasStake: userHasStake,  // ✅ avoid shadowing the state
          accountStakeAmount,
          isCreator,
          accountTokenBalance,
        };
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: toMessage(error),
        });
        return defaultValues;
      }
    },
  });

  useEffect(() => {
    if (data) {
      setClaimableRewards(data.claimableRewards);
      setHasRewards(data.hasRewards);            
      setHasStake(data.hasStake);
      setAccountStakeAmount(data.accountStakeAmount);
      setIsCreator(data.isCreator);
      setAccountTokenBalance(data.accountTokenBalance);
    }
  }, [data]);

  return (
    <AccountDataContext.Provider
      value={{ accountTokenBalance, hasStake, hasRewards, claimableRewards, accountStakeAmount, isCreator }}
    >
      {children}
    </AccountDataContext.Provider>
  );
};