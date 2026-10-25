import { checkIsOpen, type WeekSchedule } from "@/lib/business-hours";

const DIAS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export interface EstadoDaLoja {
  aberto: boolean;
  /** "Aberto · fecha 23:30", "Fechado · abre 18:00", "Fechado agora". */
  rotulo: string;
}

function emMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * O que o cartão do restaurante no menu do painel diz sobre agora.
 *
 * Aberto ou fechado é `checkIsOpen`, a mesma regra que o cardápio usa para
 * aceitar pedido: o painel não pode dizer "aberto" para uma loja que o cliente
 * vê fechada. Daqui só sai o horário que acompanha o rótulo. Como
 * `checkIsOpen`, lê o relógio do processo.
 */
export function estadoDaLoja(schedule: WeekSchedule): EstadoDaLoja {
  const aberto = checkIsOpen(schedule);
  const agoraBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const minuto = agoraBRT.getUTCHours() * 60 + agoraBRT.getUTCMinutes();
  const hoje = schedule[DIAS[agoraBRT.getUTCDay()]];
  const ontem = schedule[DIAS[(agoraBRT.getUTCDay() + 6) % 7]];

  if (aberto) {
    // A janela de ontem que atravessou a meia-noite ainda vale até o `to`
    // dela; senão, é a de hoje.
    const herdada =
      ontem?.open && emMinutos(ontem.to) <= emMinutos(ontem.from) && minuto < emMinutos(ontem.to);
    const fecha = herdada ? ontem.to : hoje?.to;
    return { aberto, rotulo: fecha ? `Aberto · fecha ${fecha}` : "Aberto" };
  }

  if (hoje?.open && minuto < emMinutos(hoje.from)) {
    return { aberto, rotulo: `Fechado · abre ${hoje.from}` };
  }
  return { aberto, rotulo: "Fechado agora" };
}
